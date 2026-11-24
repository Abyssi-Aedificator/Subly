"use strict";

const cachePrefix = "subly-shell:" + self.registration.scope + ":";
const cacheName = cachePrefix + "v1";
const shell = ["index.html", "style.css", "app.js", "dropbox.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-180.png"];
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
