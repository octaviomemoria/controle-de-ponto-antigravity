/* Basic offline cache for the PWA shell. */
const CACHE_NAME = "portal-colaborador-v3";

const APP_SHELL = [
  "/",
  "/index.html",
  "/env.js",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/assets/app.js",
  "/assets/tailwind.css"
];

function isStaticAsset(url) {
  if (!url || !url.pathname) return false;
  if (url.pathname.startsWith("/assets/")) return true;
  return (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest")
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, copy);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && (request.mode === "navigate" || url.pathname === "/index.html")) {
    event.respondWith(
      networkFirst(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isSameOrigin && (url.pathname === "/env.js" || isStaticAsset(url))) {
    event.respondWith(
      networkFirst(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
