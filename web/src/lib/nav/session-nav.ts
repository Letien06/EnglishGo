/**
 * Session navigation registry.
 *
 * Tracks which "learning" routes the user has already opened during the
 * current browser session. This is persisted in `sessionStorage` so it
 * survives the Server Component navigations that Next.js performs for
 * /listen, /read and their /practice sub-routes (each of which mounts a
 * route-level `loading.tsx` overlay).
 *
 * Purpose: the loading overlay (`AppLoadingOverlay`) should only flash on the
 * FIRST visit to a given route within a session. On subsequent visits the data
 * is already cached (dashboard grid via LevelDashboardClient, or the practice
 * session which loads quickly), so the overlay is misleading — it makes the app
 * look like it is "reloading from scratch" even when it is not.
 *
 * A route "key" is a stable, canonical string that identifies the meaningful
 * content of a page (path + the query params that change what is loaded). Two
 * navigations that resolve to the same key are considered the same destination.
 */

const STORAGE_KEY = "englishgo:visited-routes:v1";

/** Query params that actually change what a page loads (so they belong in the key). */
const RELEVANT_PARAMS = ["part", "level", "mode", "assist"] as const;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readSet(): Set<string> {
  if (!isBrowser()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // sessionStorage may be unavailable (private mode, quota) — best-effort only.
  }
}

/**
 * Build a canonical route key from a pathname and a query source.
 *
 * `search` may be a `URLSearchParams`, a `ReadonlyURLSearchParams`, or a plain
 * record of params. Only params in `RELEVANT_PARAMS` are included so that
 * cosmetic params (e.g. `q`, the resume index) do not create distinct keys.
 */
export function routeKey(
  pathname: string,
  search?: URLSearchParams | Record<string, string | undefined> | null,
): string {
  const parts: string[] = [pathname];
  if (search) {
    const get = (name: string): string | null | undefined =>
      search instanceof URLSearchParams ? search.get(name) : search[name];
    for (const name of RELEVANT_PARAMS) {
      const value = get(name);
      if (value != null && value !== "") parts.push(`${name}=${value}`);
    }
  }
  return parts.join("|");
}

/** Returns true if this route key has already been visited this session. */
export function hasVisited(key: string): boolean {
  return readSet().has(key);
}

/** Marks a route key as visited for the remainder of this session. */
export function markVisited(key: string): void {
  const set = readSet();
  if (set.has(key)) return;
  set.add(key);
  writeSet(set);
}
