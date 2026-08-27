/*
 * ENGLISHGO offline cache.
 *
 * Only cache the application shell and public, self-authored catalog metadata.
 * Never persist authenticated HTML, attempts, progress, questions, audio, or
 * remote media: those can be private, copyrighted, or must stay current.
 */
const SHELL_CACHE_NAME = "englishgo-shell-v2";
const CONTENT_CACHE_NAME = "englishgo-content-v1";
const CACHE_PREFIX = "englishgo-";
const PUBLIC_CONTENT_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;
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
    event.respondWith(publicContentCacheFirst(request));
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
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function publicContentCacheFirst(request) {
  const cache = await caches.open(CONTENT_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached && !isExpired(cached)) return cached;
  if (cached) await cache.delete(request);

  const response = await fetch(request);
  if (response.ok) await cachePublicContent(cache, request, response);
  return response;
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
