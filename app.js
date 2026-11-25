"use strict";
const byId = id => document.getElementById(id);
const key = "subly.services.v1";
const currency = "CAD";
const money = new Intl.NumberFormat(undefined, {style:"currency", currency});
const cycles = {monthly:12, yearly:1, weekly:52};
const form = byId("form");
const editor = byId("editor");
let editing = null;
let services = [];
let storageReady = true;

function customIconUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function faviconUrl(website) {
  if (typeof website !== "string" || !website.trim()) return null;
  try {
    const value = website.trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : "https://" + value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return new URL("/favicon.ico", url.origin).href;
  } catch {
    return null;
  }
}

function valid(item) {
  return item && typeof item.id === "string" && typeof item.service === "string" &&
    Number.isSafeInteger(item.cents) && item.cents >= 0 && Object.hasOwn(cycles,item.cycle) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(item.date)) &&
    ["Active","Suspended","Paused","Cancelled"].includes(item.state) &&
    (item.state !== "Suspended" ||
      (typeof item.pauseOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.pauseOn) &&
        Number.isFinite(Date.parse(item.pauseOn))));
}
function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(saved) || !saved.every(valid)) throw Error();
    services = saved;
    storageReady = true;
  } catch {
    storageReady = false;
    byId("notice").textContent = "Saved subscriptions could not be read. Check browser storage and reload.";
  }
}
function persist(next) {
  if (!storageReady) return false;
  try {localStorage.setItem(key,JSON.stringify(next));}
  catch {byId("error").textContent = "Unable to save. Check available browser storage."; return false;}
  services = next;
  render();
  window.dispatchEvent(new Event("subly:subscriptions-changed"));
  return true;
}
function today() {
  const now = new Date();
  return new Date(now.getFullYear(),now.getMonth(),now.getDate());
}
function calendarDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
function renewalCountdown(date, day) {
  const days = (calendarDay(date) - calendarDay(day)) / 86400000;
  if (days === 0) return "Renews today";
  if (days === 1) return "Renews tomorrow";
  return "Renews in " + days + " days";
}
function nextRenewal(item, day) {
  const start = new Date(item.date + "T00:00:00");
  if (start >= day) return start;
  if (item.cycle === "weekly") {
    const weeks = Math.ceil((calendarDay(day)-calendarDay(start))/604800000);
    start.setDate(start.getDate()+7*weeks);
    return start;
  }
  const step = item.cycle === "monthly" ? 1 : 12;
  const elapsed = 12*(day.getFullYear()-start.getFullYear())+day.getMonth()-start.getMonth();
  const month = start.getMonth()+Math.floor(elapsed/step)*step;
  function occurrence(m) {
    const last = new Date(start.getFullYear(),m+1,0).getDate();
    return new Date(start.getFullYear(),m,Math.min(start.getDate(),last));
  }
  const candidate = occurrence(month);
  return candidate >= day ? candidate : occurrence(month+step);
}
function el(tag,cls,value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value !== undefined) node.textContent = value;
  return node;
}
function render() {
  const day = today();
  const visibleServices = services.map(s => s.state === "Suspended" &&
    new Date(s.pauseOn + "T00:00:00") <= day ? {...s, state:"Paused"} : s);
  const active = visibleServices.filter(s => s.state === "Active").map(s => ({s,date:nextRenewal(s,day)}))
    .sort((a,b) => a.date-b.date || a.s.service.localeCompare(b.s.service));
  const current = visibleServices.filter(s => s.state === "Active" || s.state === "Suspended");
  const annual = current.reduce((sum,s) => sum+s.cents*cycles[s.cycle],0)/100;
  byId("monthly").textContent = money.format(annual/12);
  byId("yearly").textContent = money.format(annual);
  byId("active").textContent = current.length;
  const upcoming = byId("upcoming");
  upcoming.replaceChildren();
  for (const {s,date} of active.slice(0,3)) {
    const row = el("div","renewal");
    const stamp = el("div","date");
    stamp.append(el("small","",date.toLocaleString(undefined,{month:"short"})),el("b","",date.getDate()));
    const details = el("div","details");
    details.append(el("b","",s.service),el("small","",renewalCountdown(date,day)));
    row.append(stamp,details,el("span","",money.format(s.cents/100)));
    upcoming.append(row);
  }
  if (!active.length) upcoming.append(el("p","empty","Active subscriptions will appear here in renewal order."));
  const query = byId("search").value.trim().toLowerCase();
  const status = byId("status").value;
  const list = byId("list");
  list.replaceChildren();
  const statusOrder = {Active:0, Suspended:0, Paused:1, Cancelled:2};
  const renewalDates = new Map(active.map(({s,date}) => [s,date]));
  for (const s of current) {
    if (s.state === "Suspended") renewalDates.set(s, new Date(s.pauseOn + "T00:00:00"));
  }
  const matches = visibleServices.filter(s => s.service.toLowerCase().includes(query) &&
    (status === "All statuses" || s.state === status)).sort((a,b) => {
      const stateDifference = statusOrder[a.state] - statusOrder[b.state];
      if (stateDifference) return stateDifference;
      if (statusOrder[a.state] === 0) {
        const dateDifference = renewalDates.get(a) - renewalDates.get(b);
        if (dateDifference) return dateDifference;
      }
      return a.service.localeCompare(b.service);
    });
  for (const s of matches) {
    const row = el("div","row");
    const name = el("div","details");
    let when = s.state;
    if (s.state === "Suspended") {
      const date = new Date(s.pauseOn + "T00:00:00");
      when = "Suspended · Pauses " + date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
    }
    if (s.state === "Active") {
      const date = renewalDates.get(s);
      const formattedDate = date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
      when = renewalCountdown(date,day) + " · " + formattedDate;
    }
    if (s.state === "Paused" || s.state === "Cancelled") {
      const renewalDate = new Date((s.state === "Paused" ? s.pauseOn ?? s.date : s.date) + "T00:00:00");
      const days = (calendarDay(day) - calendarDay(renewalDate)) / 86400000;
      if (days === 0) when = s.state + " today";
      if (days > 0) {
        const duration = days + (days === 1 ? " day" : " days");
        when = s.state === "Paused" ? "Paused for " + duration : "Cancelled " + duration + " ago";
      }
    }
    name.append(el("b","",s.service),el("small","",when));
    const price = el("div","price");
    price.append(el("b","",money.format(s.cents/100)),el("small","",s.cycle));
    const edit = el("button","","Edit");
    edit.setAttribute("aria-label","Edit "+s.service);
    edit.onclick = () => openEditor(s);
    const avatar = el("div","avatar",Array.from(s.service)[0].toUpperCase());
    avatar.setAttribute("aria-hidden", "true");
    const iconUrl = customIconUrl(s.iconUrl);
    const fallbackUrl = faviconUrl(s.website);
    if (iconUrl || fallbackUrl) {
      const icon = el("img","service-icon");
      icon.alt = "";
      icon.referrerPolicy = "no-referrer";
      icon.onload = () => avatar.replaceChildren(icon);
      if (iconUrl && fallbackUrl && iconUrl !== fallbackUrl) {
        icon.onerror = () => {
          icon.onerror = null;
          icon.src = fallbackUrl;
        };
      }
      icon.src = iconUrl || fallbackUrl;
    }
    row.append(avatar,name,price,edit);
    list.append(row);
  }
  if (!matches.length) list.append(el("p","empty",services.length ? "No matching subscriptions." : "Add your first subscription to see its cost and renewal date."));
  byId("add").disabled = !storageReady;
}
function openEditor(s) {
  editing = s?.id ?? null;
  form.reset();
  for (const field of ["service","cycle","state"]) if (s) form.elements[field].value = s[field];
  form.elements.price.value = s ? (s.cents/100).toFixed(2) : "";
  form.elements.date.value = s?.date ?? localDate();
  byId("title").textContent = s ? "Edit subscription" : "Add subscription";
  byId("remove").hidden = !s;
  byId("error").textContent = "";
  editor.showModal();
  form.elements.service.focus();
  form.elements.website.value = s?.website ?? "";
  form.elements.iconUrl.value = s?.iconUrl ?? "";
}
function localDate(day = today()) {
  return [day.getFullYear(), String(day.getMonth()+1).padStart(2,"0"), String(day.getDate()).padStart(2,"0")].join("-");
}
byId("currency").textContent = "("+currency+")";
byId("add").onclick = () => openEditor(null);
byId("close").onclick = () => editor.close();
byId("search").oninput = byId("status").onchange = render;
form.onsubmit = event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const service = values.service.trim();
  if (!service) {byId("error").textContent = "Enter a service name."; return;}
  const website = values.website.trim();
  if (website && !faviconUrl(website)) {
    byId("error").textContent = "Enter a valid HTTPS website or domain.";
    return;
  }
  const iconUrl = values.iconUrl.trim();
  if (iconUrl && !customIconUrl(iconUrl)) {
    byId("error").textContent = "Enter a direct HTTPS image URL for the icon.";
    return;
  }
  const item = {id:editing ?? crypto.randomUUID(),service,cents:Math.round(Number(values.price)*100),
    date:values.date,cycle:values.cycle,state:values.state};
  const previous = services.find(s => s.id === editing);
  if (item.state === "Suspended") {
    const sameSchedule = previous?.state === "Suspended" &&
      previous.date === item.date && previous.cycle === item.cycle &&
      previous.pauseOn > localDate();
    item.pauseOn = sameSchedule ? previous.pauseOn : localDate(nextRenewal(item,today()));
  } else if (item.state === "Paused" && previous?.pauseOn <= localDate() && previous.date === item.date) {
    item.pauseOn = previous.pauseOn;
  }
  if (website) item.website = website;
  if (iconUrl) item.iconUrl = iconUrl;
  const next = editing ? services.map(s => s.id === editing ? item : s) : [...services,item];
  if (persist(next)) editor.close();
};
byId("remove").onclick = () => {
  if (confirm("Delete this subscription from Subly?") && persist(services.filter(s => s.id !== editing))) editor.close();
};
window.addEventListener("storage",() => {read();render();});
window.addEventListener("focus",render);
let lastCalendarDate = localDate();
setInterval(() => {
  const date = localDate();
  if (date === lastCalendarDate) return;
  lastCalendarDate = date;
  render();
}, 30000);
read();
render();


const themeKey = "subly.theme";
const themeSwitch = byId("theme-switch");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const preference = themeSwitch.value;
  const dark = preference === "dark" || (preference === "system" && systemTheme.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

try {
  const savedTheme = localStorage.getItem(themeKey);
  if (["light", "dark", "system"].includes(savedTheme)) themeSwitch.value = savedTheme;
} catch {
  // Keep the default when storage is unavailable.
}

applyTheme();
systemTheme.addEventListener("change", applyTheme);
themeSwitch.addEventListener("change", () => {
  applyTheme();
  try {
    localStorage.setItem(themeKey, themeSwitch.value);
  } catch {
    // The theme still applies for this page visit.
  }
});

function showPage() {
  const settingsOpen = location.hash === "#settings";
  byId("overview").hidden = settingsOpen;
  byId("settings").hidden = !settingsOpen;
  byId(settingsOpen ? "overview-link" : "settings-link").removeAttribute("aria-current");
  byId(settingsOpen ? "settings-link" : "overview-link").setAttribute("aria-current", "page");
}

window.addEventListener("hashchange", showPage);
showPage();

const checkUpdates = byId("check-updates");
const checkStatus = byId("check-update-status");
const supportsUpdates = "serviceWorker" in navigator && window.isSecureContext && /^https?:$/.test(location.protocol);
checkUpdates.onclick = () => {
  checkStatus.textContent = supportsUpdates
    ? "The update service is unavailable. Reload Subly and try again."
    : "Open Subly over HTTPS or localhost to check for updates.";
};
if (supportsUpdates) {
  setupAppUpdates().catch(error => console.warn("Subly offline setup failed.", error));
}

async function setupAppUpdates() {
  const workers = navigator.serviceWorker;
  const dialog = byId("update-dialog");
  const reopen = byId("show-update");
  const updateNow = byId("update-now");
  const status = byId("update-status");
  let offeredWorker;
  let applying = false;
  let outdated = false;
  let deferred = false;

  workers.addEventListener("controllerchange", () => {
    if (applying) {
      location.reload();
    } else if (offeredWorker) {
      outdated = true;
      reopen.hidden = false;
    }
  });

  const registration = await workers.register("./sw.js");

  function promptUpdate() {
    if (!offeredWorker || document.querySelector("dialog[open]")) return;
    dialog.showModal();
  }

  function offerWaitingUpdate() {
    const waiting = registration.waiting;
    if (!waiting || !workers.controller || waiting === offeredWorker) return;
    offeredWorker = waiting;
    reopen.hidden = false;
    if (!document.hidden) promptUpdate();
  }

  function watchInstallation() {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") offerWaitingUpdate();
    });
  }

  registration.addEventListener("updatefound", watchInstallation);
  watchInstallation();
  offerWaitingUpdate();
  reopen.onclick = promptUpdate;
  dialog.addEventListener("close", () => {
    deferred = true;
  });
  for (const otherDialog of document.querySelectorAll("dialog:not(#update-dialog)")) {
    otherDialog.addEventListener("close", () => {
      if (!deferred && !document.hidden) promptUpdate();
    });
  }

  updateNow.onclick = () => {
    if (outdated) {
      location.reload();
      return;
    }
    const waiting = registration.waiting;
    if (!waiting) {
      status.textContent = "The update is no longer waiting. Reopen Subly to check again.";
      return;
    }
    applying = true;
    updateNow.disabled = true;
    status.textContent = "Applying update…";
    waiting.postMessage({type: "SUBLY_APPLY_UPDATE"});
  };

  let lastCheck = Date.now();
  checkUpdates.onclick = async () => {
    checkUpdates.disabled = true;
    checkStatus.textContent = "Checking for updates…";
    lastCheck = Date.now();
    try {
      if (!registration.waiting && !registration.installing && !outdated) await registration.update();
      const installing = registration.installing;
      if (installing && installing.state !== "installed" && installing.state !== "redundant") {
        await new Promise(resolve => {
          installing.addEventListener("statechange", function finished() {
            if (!["installed", "activated", "redundant"].includes(installing.state)) return;
            installing.removeEventListener("statechange", finished);
            resolve();
          });
        });
      }
      if (registration.waiting && workers.controller) offerWaitingUpdate();
      if (offeredWorker) {
        checkStatus.textContent = "An update is available.";
        promptUpdate();
      } else if (installing?.state === "redundant") {
        checkStatus.textContent = "The update could not be prepared. Try again.";
      } else {
        checkStatus.textContent = "Subly is up to date.";
      }
    } catch {
      checkStatus.textContent = "Could not check for updates. Check your connection and try again.";
    } finally {
      checkUpdates.disabled = false;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!deferred) promptUpdate();
    if (Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  });
}

byId("open-changelog").onclick = async () => {
  const dialog = byId("changelog-dialog");
  const content = byId("changelog-content");
  content.textContent = "Loading release notes…";
  dialog.showModal();
  try {
    const response = await fetch("./changelog.txt");
    if (!response.ok) throw new Error("Changelog unavailable");
    const notes = await response.text();
    content.replaceChildren();
    let list;
    for (const line of notes.split(/\r?\n/)) {
      if (/^(?:Unreleased|(?:Version )?\d+\.\d+\.\d+(?: -- \d{4}-\d{2}-\d{2})?)$/.test(line)) {
        content.append(el("h3", "", line));
        list = null;
      } else if (line.startsWith("- ")) {
        if (!list) {
          list = el("ul");
          content.append(list);
        }
        list.append(el("li", "", line.slice(2)));
      }
    }
  } catch {
    content.textContent = "Could not load the release notes.";
  }
};

const accentPicker = byId("accent-colour");
const accentKey = "subly.accent";
try {
  const savedAccent = localStorage.getItem(accentKey);
  for (const radio of accentPicker.querySelectorAll("input")) {
    if (radio.value === savedAccent) radio.checked = true;
  }
} catch {
  // Keep the default when browser storage is unavailable.
}

document.documentElement.dataset.accent = accentPicker.querySelector(":checked").value;
accentPicker.addEventListener("change", event => {
  const accent = event.target.value;
  document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(accentKey, accent);
  } catch {
    // The accent still applies for this page visit.
  }
});
