"use strict";
{
  const connect = byId("dropbox-connect");
  const actions = byId("dropbox-actions");
  const status = byId("dropbox-status");
  const syncStatus = byId("overview-sync");
  const syncedKey = "subly.dropbox.synced";
  let syncing = false;
  let busy = false;
  let syncTimer;
  let statusRevision = 0;

  const snapshot = entries => JSON.stringify({app: "Subly", version: 1, subscriptions: entries});

  async function fingerprint(data) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function updateSyncStatus() {
    const revision = ++statusRevision;
    if (syncing || !connection) {
      syncStatus.textContent = syncing ? "Dropbox · Sync in progress" : "Dropbox · Not connected";
      return;
    }
    try {
      const saved = syncBaseline();
      const matches = storageReady && saved && saved.hash === await fingerprint(snapshot(services));
      if (revision === statusRevision) {
        syncStatus.textContent = matches ? "Dropbox · No changes" : "Dropbox · Changes need sync";
      }
    } catch {
      if (revision === statusRevision) syncStatus.textContent = "Dropbox · Status unavailable";
    }
  }

  function syncBaseline() {
    const saved = localStorage.getItem(syncedKey);
    return saved?.startsWith("{") ? JSON.parse(saved) : null;
  }

  async function markSynced(data, rev) {
    try {
      localStorage.setItem(syncedKey, JSON.stringify({hash: await fingerprint(data), rev}));
    } catch {
      // The transfer succeeded even if the local status could not be saved.
    }
  }
  const pendingKey = "subly.dropbox.pending";
  const tokenKey = "subly.dropbox.token";
  const appKeyStorage = "subly.dropbox.appKey";
  const connectionKey = "subly.dropbox.connection";
  const appKeyInput = connect.elements.appKey;
  const path = "/subly-backup.json";
  const redirect = location.origin + location.pathname;
  const supported = isSecureContext && /^https?:$/.test(location.protocol);
  let token;
  let connection;
  let expiresAt = 0;

  function showConnection() {
    updateSyncStatus();
    const connected = Boolean(token || connection);
    connect.hidden = connected || !supported;
    actions.hidden = !connected;
    status.textContent = connected ? "Dropbox connected." : supported
      ? "Connect to back up or restore your subscription list."
      : "Open Subly over HTTPS or localhost to connect Dropbox.";
  }

  async function run(operation, transfer = false) {
    if (busy) return;
    busy = true;
    const controls = document.querySelectorAll("#dropbox-connect input, #dropbox-connect button, #dropbox-actions button");
    controls.forEach(control => { control.disabled = true; });
    if (transfer) {
      syncing = true;
      updateSyncStatus();
    }
    try {
      await operation();
    } catch (error) {
      status.textContent = error instanceof TypeError ? "Could not reach Dropbox. Try again." : error.message;
    } finally {
      busy = false;
      if (transfer) {
        syncing = false;
        updateSyncStatus();
      }
      controls.forEach(control => { control.disabled = false; });
    }
  }

  const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
    byte => byte.toString(16).padStart(2, "0")).join("");

  connect.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const appKey = appKeyInput.value.trim();
      if (!appKey) throw Error("Enter your Dropbox app key.");
      const verifier = randomHex();
      const state = randomHex();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      sessionStorage.setItem(pendingKey, JSON.stringify({appKey, verifier, state, redirect}));
      location.assign("https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({
        client_id: appKey, redirect_uri: redirect, response_type: "code", state,
        code_challenge: challenge, code_challenge_method: "S256", token_access_type: "offline",
        scope: "files.content.read files.content.write files.metadata.read"
      }));
    });
  };

  async function restoreConnection() {
    const saved = JSON.parse(localStorage.getItem(connectionKey) || "null");
    if (saved?.appKey && saved.refreshToken) connection = saved;
    sessionStorage.removeItem(tokenKey);
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
    const {access_token, refresh_token, expires_in} = await response.json();
    if (!access_token || !refresh_token) throw Error("Dropbox did not return a persistent connection. Connect again.");
    connection = {appKey: pending.appKey, refreshToken: refresh_token};
    localStorage.setItem(connectionKey, JSON.stringify(connection));
    localStorage.removeItem(syncedKey);
    try {
      localStorage.setItem(appKeyStorage, pending.appKey);
    } catch {
      // The current Dropbox session still works if preferences cannot be saved.
    }
    token = access_token;
    expiresAt = Date.now() + Number(expires_in || 14400) * 1000;
    showConnection();
  }

  async function refreshAccess() {
    if (!connection) throw Error("Connect Dropbox to continue.");
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({grant_type: "refresh_token", refresh_token: connection.refreshToken,
        client_id: connection.appKey})
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      if (result?.error === "invalid_grant") {
        disconnect();
        throw Error("Dropbox authorization expired. Connect again.");
      }
      throw Error("Dropbox could not renew access. Try again.");
    }
    const {access_token, expires_in} = await response.json();
    if (!access_token) throw Error("Dropbox did not return an access token.");
    token = access_token;
    expiresAt = Date.now() + Number(expires_in || 14400) * 1000;
  }

  async function request(host, endpoint, headers, body) {
    if (!token || Date.now() + 60000 >= expiresAt) await refreshAccess();
    const send = () => fetch("https://" + host + ".dropboxapi.com/2/files/" + endpoint, {
      method: "POST", headers: {...headers, Authorization: "Bearer " + token}, body
    });
    let response = await send();
    if (response.status === 401) {
      token = null;
      await refreshAccess();
      response = await send();
    }
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

  function confirmReplacement(title, message, action) {
    const dialog = byId("dropbox-confirm");
    byId("dropbox-confirm-title").textContent = title;
    byId("dropbox-confirm-message").textContent = message;
    byId("dropbox-confirm-action").textContent = action;
    dialog.returnValue = "cancel";
    return new Promise(resolve => {
      dialog.showModal();
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "replace"), {once:true});
    });
  }

  async function upload(automatic) {
    read();
    if (!storageReady) throw Error("Subly could not read the local subscription list.");
    const backup = snapshot(services);
    const baseline = syncBaseline();
    if (automatic && baseline?.hash === await fingerprint(backup)) return;
    const metadata = await request("api", "get_metadata", {"Content-Type": "application/json"}, JSON.stringify({path}));
    let mode = "add";
    if (metadata.ok) {
      const {rev} = await metadata.json();
      if (!rev) throw Error("Subly could not read the current Dropbox backup revision.");
      if (automatic && baseline?.rev !== rev) {
        throw Error("Dropbox has a different backup. Review Back up now or Restore backup in Settings.");
      }
      if (!automatic && !await confirmReplacement("Replace Dropbox backup?",
        "This device’s subscription list will replace the existing Dropbox backup.", "Replace backup")) return;
      mode = {".tag": "update", update: rev};
    } else if (!(await missing(metadata))) {
      throw Error("Subly could not check the Dropbox backup. Verify the app permissions.");
    } else if (automatic && baseline?.rev) {
      throw Error("The Dropbox backup was removed. Use Back up now in Settings to create it again.");
    }
    const saved = await request("content", "upload", {
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({path, mode, autorename: false, strict_conflict: true})
    }, backup);
    if (saved.status === 409) throw Error("The Dropbox backup changed. Try again to review the latest version.");
    if (!saved.ok) throw Error("Dropbox could not save the backup.");
    const {rev} = await saved.json();
    await markSynced(backup, rev);
    status.textContent = "Subscription backup saved to Dropbox.";
  }
  byId("dropbox-upload").onclick = () => run(() => upload(false), true);

  byId("dropbox-download").onclick = () => run(async () => {
    const metadata = await request("api", "get_metadata", {"Content-Type": "application/json"}, JSON.stringify({path}));
    if (await missing(metadata)) throw Error("No Subly backup was found in Dropbox.");
    if (!metadata.ok) throw Error("Dropbox could not check the backup.");
    const {rev} = await metadata.json();
    if (!rev) throw Error("Dropbox did not return a backup revision.");
    const response = await request("content", "download", {"Dropbox-API-Arg": JSON.stringify({path: "rev:" + rev})});
    if (!response.ok) throw Error("Dropbox could not download the backup.");
    const backup = await response.json().catch(() => null);
    const subscriptions = backup?.subscriptions;
    if (backup?.app !== "Subly" || backup.version !== 1 || !Array.isArray(subscriptions) ||
        !subscriptions.every(item => valid(item) && item.service.trim()) ||
        new Set(subscriptions.map(item => item.id)).size !== subscriptions.length) {
      throw Error("The Dropbox file is not a valid Subly backup.");
    }
    const localBeforeConfirmation = localStorage.getItem(key);
    if (!await confirmReplacement("Restore Dropbox backup?",
      "The " + subscriptions.length + " entries from Dropbox will replace this device’s subscription list.", "Restore backup")) return;
    if (localStorage.getItem(key) !== localBeforeConfirmation) {
      throw Error("The local subscription list changed. Review the backup again before restoring.");
    }
    read();
    if (!persist(subscriptions)) throw Error("Subly could not save the restored subscriptions.");
    await markSynced(snapshot(subscriptions), rev);
    status.textContent = "Subscription backup restored from Dropbox.";
  }, true);

  function disconnect() {
    localStorage.removeItem(connectionKey);
    localStorage.removeItem(syncedKey);
    connection = null;
    token = null;
    expiresAt = 0;
    sessionStorage.removeItem(tokenKey);
    showConnection();
  }

  byId("dropbox-disconnect").onclick = () => run(disconnect);
  function scheduleSync() {
    clearTimeout(syncTimer);
    if (!connection || !navigator.onLine) return;
    syncTimer = setTimeout(() => {
      if (busy) scheduleSync();
      else run(() => upload(true), true);
    }, 1500);
  }
  window.addEventListener("subly:subscriptions-changed", updateSyncStatus);
  window.addEventListener("subly:subscriptions-changed", scheduleSync);
  window.addEventListener("storage", updateSyncStatus);
  window.addEventListener("online", scheduleSync);
  try {
    appKeyInput.value = localStorage.getItem(appKeyStorage) ?? "";
  } catch {
    // The key can still be entered manually.
  }
  showConnection();
  if (supported) run(restoreConnection).then(scheduleSync);
}
