const CACHE_VERSION = "2026-04-29";
const SHELL_CACHE = `transcribble-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `transcribble-assets-${CACHE_VERSION}`;
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon", "/apple-icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("transcribble-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isHelperOrApiLikeRequest(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isSafeStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Navigations are network-first so a deployed app shell is not trapped behind
// an old cache. The cached "/" shell is only an offline fallback.
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const clone = response.clone();
      void caches.open(SHELL_CACHE).then((cache) => cache.put("/", clone));
    }
    return response;
  } catch {
    return (await caches.match("/")) || Response.error();
  }
}

// Static app assets can be reused offline, but helper, localhost, API, and
// arbitrary same-origin GET responses are deliberately not cached here.
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        const clone = response.clone();
        void caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await refresh) || Response.error();
}

function isHelperOrApiLikeRequest(url) {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return true;
  }

  if (url.origin !== self.location.origin) {
    return true;
  }

  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/");
}

function isSafeStaticAsset(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon"
  );
}
