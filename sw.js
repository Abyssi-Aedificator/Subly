"use strict";

const cachePrefix = "subly-shell:" + self.registration.scope + ":";
// Advance this revision when any app shell asset changes, including icon-only updates.
const cacheName = cachePrefix + "v46";
const shell = ["index.html", "style.css", "app.js", "dropbox.js", "changelog.txt", "manifest.webmanifest",
  "icon-clear-192.png", "icon-clear-512.png", "icon-clear-180.png", "Roboto.ttf"];
const shellUrls = shell.map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    shellUrls.map(url => new Request(url, {cache: "reload"}))
  )));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(cachePrefix) && key !== cacheName)
    .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const index = shellUrls[0];
  const appPage = url.origin + url.pathname === index || url.origin + url.pathname === self.registration.scope;
  if (request.mode === "navigate" && appPage) {
    // Query parameters such as Dropbox OAuth codes never become cache keys.
    event.respondWith(caches.open(cacheName).then(cache =>
      cache.match(index).then(response => response || fetch(request))
    ));
  } else if (shellUrls.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then(cache =>
      cache.match(request).then(response => response || fetch(request))
    ));
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "SUBLY_APPLY_UPDATE") {
    event.waitUntil(self.skipWaiting());
  }
});
