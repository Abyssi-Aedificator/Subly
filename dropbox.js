"use strict";
{
  const connect = byId("dropbox-connect");
  const actions = byId("dropbox-actions");
  const status = byId("dropbox-status");
  const pendingKey = "subly.dropbox.pending";
  const tokenKey = "subly.dropbox.token";
  const path = "/subly-backup.json";
  const redirect = location.origin + location.pathname;
  const supported = isSecureContext && /^https?:$/.test(location.protocol);
  let token;

  function showConnection() {
    connect.hidden = Boolean(token) || !supported;
    actions.hidden = !token;
    status.textContent = token ? "Dropbox connected for this tab." : supported
      ? "Connect to back up or restore your subscription list."
      : "Open Subly over HTTPS or localhost to connect Dropbox.";
  }

  async function run(operation) {
    const controls = document.querySelectorAll("#dropbox-connect input, #dropbox-connect button, #dropbox-actions button");
    controls.forEach(control => { control.disabled = true; });
    try {
      await operation();
    } catch (error) {
      status.textContent = error instanceof TypeError ? "Could not reach Dropbox. Try again." : error.message;
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  }

  const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
    byte => byte.toString(16).padStart(2, "0")).join("");

  connect.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const appKey = connect.elements.appKey.value.trim();
      if (!appKey) throw Error("Enter your Dropbox app key.");
      const verifier = randomHex();
      const state = randomHex();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      sessionStorage.setItem(pendingKey, JSON.stringify({appKey, verifier, state, redirect}));
      location.assign("https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({
        client_id: appKey, redirect_uri: redirect, response_type: "code", state,
        code_challenge: challenge, code_challenge_method: "S256",
        scope: "files.content.read files.content.write files.metadata.read"
      }));
    });
  };

  async function restoreConnection() {
    token = sessionStorage.getItem(tokenKey);
    showConnection();
    const url = new URL(location.href);
    const pending = JSON.parse(sessionStorage.getItem(pendingKey));
    if (!pending || (!url.searchParams.has("code") && !url.searchParams.has("error"))) return;
    const {code, state} = Object.fromEntries(url.searchParams);
    for (const param of ["code", "state", "error", "error_description"]) url.searchParams.delete(param);
    url.hash = "settings";
    history.replaceState(null, "", url);
    showPage();
    sessionStorage.removeItem(pendingKey);
    if (state !== pending.state || redirect !== pending.redirect) throw Error("Dropbox authorization could not be verified. Connect again.");
    if (!code) throw Error("Dropbox authorization was cancelled or denied.");
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({code, grant_type: "authorization_code", client_id: pending.appKey,
        redirect_uri: redirect, code_verifier: pending.verifier})
    });
    if (!response.ok) throw Error("Dropbox could not authorize Subly. Check your app key and redirect URL.");
    const {access_token} = await response.json();
    if (!access_token) throw Error("Dropbox did not return an access token.");
    sessionStorage.setItem(tokenKey, access_token);
    token = access_token;
    showConnection();
  }

  async function request(host, endpoint, headers, body) {
    const response = await fetch("https://" + host + ".dropboxapi.com/2/files/" + endpoint, {
      method: "POST", headers: {...headers, Authorization: "Bearer " + token}, body
    });
    if (response.status === 401) {
      disconnect();
      throw Error("Dropbox authorization expired. Connect again.");
    }
    return response;
  }

  async function missing(response) {
    if (response.status !== 409) return false;
    const result = await response.json();
    return result.error_summary?.startsWith("path/not_found");
  }

  byId("dropbox-upload").onclick = () => run(async () => {
    read();
    if (!storageReady) throw Error("Subly could not read the local subscription list.");
    const backup = JSON.stringify({app: "Subly", version: 1, subscriptions: services});
    const metadata = await request("api", "get_metadata", {"Content-Type": "application/json"}, JSON.stringify({path}));
    let mode = "add";
    if (metadata.ok) {
      const {rev} = await metadata.json();
      if (!rev) throw Error("Subly could not read the current Dropbox backup revision.");
      if (!confirm("Replace the existing Dropbox backup with this device’s subscription list?")) return;
      mode = {".tag": "update", update: rev};
    } else if (!(await missing(metadata))) {
      throw Error("Subly could not check the Dropbox backup. Verify the app permissions.");
    }
    const saved = await request("content", "upload", {
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({path, mode, autorename: false, strict_conflict: true})
    }, backup);
    if (saved.status === 409) throw Error("The Dropbox backup changed. Try again to review the latest version.");
    if (!saved.ok) throw Error("Dropbox could not save the backup.");
    status.textContent = "Subscription backup saved to Dropbox.";
  });

  byId("dropbox-download").onclick = () => run(async () => {
    const response = await request("content", "download", {"Dropbox-API-Arg": JSON.stringify({path})});
    if (await missing(response)) throw Error("No Subly backup was found in Dropbox.");
    if (!response.ok) throw Error("Dropbox could not download the backup.");
    const backup = await response.json().catch(() => null);
    const subscriptions = backup?.subscriptions;
    if (backup?.app !== "Subly" || backup.version !== 1 || !Array.isArray(subscriptions) ||
        !subscriptions.every(item => valid(item) && item.service.trim()) ||
        new Set(subscriptions.map(item => item.id)).size !== subscriptions.length) {
      throw Error("The Dropbox file is not a valid Subly backup.");
    }
    if (!confirm("Replace this device’s subscription list with the " + subscriptions.length + " entries from Dropbox?")) return;
    read();
    if (!persist(subscriptions)) throw Error("Subly could not save the restored subscriptions.");
    status.textContent = "Subscription backup restored from Dropbox.";
  });

  function disconnect() {
    token = null;
    sessionStorage.removeItem(tokenKey);
    showConnection();
  }

  byId("dropbox-disconnect").onclick = disconnect;
  showConnection();
  if (supported) run(restoreConnection);
}
