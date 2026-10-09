/*
 * ENGLISHGO offline cache.
 *
 * Only cache the application shell and public, self-authored catalog metadata.
 * Never persist authenticated HTML, attempts, progress, questions, audio, or
 * remote media: those can be private, copyrighted, or must stay current.
 */
const BUILD_VERSION = new URL(self.location.href).searchParams.get("v") || "development";
const SHELL_CACHE_NAME = `englishgo-shell-${BUILD_VERSION}`;
const CONTENT_CACHE_NAME = `englishgo-content-${BUILD_VERSION}`;
const CACHE_PREFIX = "englishgo-";
const PUBLIC_CONTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SHELL_ENTRIES = 128;
const CACHED_AT_HEADER = "x-englishgo-cached-at";
const SHELL_ASSETS = ["/offline.html", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE_NAME && key !== CONTENT_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (isPublicCatalogRequest(url)) {
    const refresh = refreshPublicContent(request);
    // Keep the worker alive after returning stale data, until it has persisted
    // the refreshed copy. A detached promise alone can be terminated by the UA.
    event.waitUntil(refresh.then(() => undefined));
    event.respondWith(publicContentStaleWhileRevalidate(request, refresh));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(shellCacheFirst(request));
  }
});

function isPublicCatalogRequest(url) {
  return url.pathname === "/api/writing/prompts";
}

function isShellAsset(url) {
  return url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.svg" ||
    /\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|ico|woff2)$/i.test(url.pathname);
}

async function shellCacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_SHELL_ENTRIES)).map(key => cache.delete(key)));
    } catch { /* Storage eviction must not turn a successful fetch into an error. */ }
  }
  return response;
}

async function refreshPublicContent(request) {
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (!response.ok) return null;
    try {
      const cache = await caches.open(CONTENT_CACHE_NAME);
      await cachePublicContent(cache, request, response);
    } catch { /* Return fresh content even when the disk cache is full. */ }
    return response;
  } catch { return null; }
}

async function publicContentStaleWhileRevalidate(request, refresh) {
  const cache = await caches.open(CONTENT_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached && !isExpired(cached)) {
    return cached;
  }
  return (await refresh) || cached || new Response("Offline", { status: 503 });
}

function isExpired(response) {
  const cachedAt = Number(response.headers.get(CACHED_AT_HEADER));
  return !Number.isFinite(cachedAt) || Date.now() - cachedAt > PUBLIC_CONTENT_MAX_AGE_MS;
}

async function cachePublicContent(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  const cachedResponse = new Response(await response.clone().blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, cachedResponse);
}
