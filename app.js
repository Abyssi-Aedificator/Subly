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

function valid(item) {
  return item && typeof item.id === "string" && typeof item.service === "string" &&
    Number.isSafeInteger(item.cents) && item.cents >= 0 && Object.hasOwn(cycles,item.cycle) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(item.date)) &&
    ["Active","Paused","Cancelled"].includes(item.state);
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
  const active = services.filter(s => s.state === "Active").map(s => ({s,date:nextRenewal(s,day)}))
    .sort((a,b) => a.date-b.date || a.s.service.localeCompare(b.s.service));
  const annual = active.reduce((sum,{s}) => sum+s.cents*cycles[s.cycle],0)/100;
  byId("monthly").textContent = money.format(annual/12);
  byId("yearly").textContent = money.format(annual);
  byId("active").textContent = active.length;
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
  const statusOrder = {Active:0, Paused:1, Cancelled:2};
  const renewalDates = new Map(active.map(({s,date}) => [s,date]));
  const matches = services.filter(s => s.service.toLowerCase().includes(query) &&
    (status === "All statuses" || s.state === status)).sort((a,b) => {
      const stateDifference = statusOrder[a.state] - statusOrder[b.state];
      if (stateDifference) return stateDifference;
      if (a.state === "Active") {
        const dateDifference = renewalDates.get(a) - renewalDates.get(b);
        if (dateDifference) return dateDifference;
      }
      return a.service.localeCompare(b.service);
    });
  for (const s of matches) {
    const row = el("div","row");
    const name = el("div","details");
    let when = s.state;
    if (s.state === "Active") {
      const date = renewalDates.get(s);
      const formattedDate = date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
      when = renewalCountdown(date,day) + " · " + formattedDate;
    }
    if (s.state === "Paused" || s.state === "Cancelled") {
      const renewalDate = new Date(s.date + "T00:00:00");
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
    row.append(el("div","avatar",Array.from(s.service)[0].toUpperCase()),name,price,edit);
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
}
function localDate() {
  const day = today();
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
  const item = {id:editing ?? crypto.randomUUID(),service,cents:Math.round(Number(values.price)*100),
    date:values.date,cycle:values.cycle,state:values.state};
  const next = editing ? services.map(s => s.id === editing ? item : s) : [...services,item];
  if (persist(next)) editor.close();
};
byId("remove").onclick = () => {
  if (confirm("Delete this subscription from Subly?") && persist(services.filter(s => s.id !== editing))) editor.close();
};
window.addEventListener("storage",() => {read();render();});
window.addEventListener("focus",render);
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
  byId("settings-link").hidden = settingsOpen;
}

window.addEventListener("hashchange", showPage);
showPage();

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("./sw.js").catch(error => {
    console.warn("Subly offline setup failed.", error);
  });
}
