import { vocabularySnapshotSchema } from "../../src/lib/storage/vocab-snapshot.ts";

export const DAUENGLISH_SOURCE_URL = "https://odlnhfaygiotcyehuysw.supabase.co";
const EXPECTED_EMAIL = "letiendk06@gmail.com";

/** A process-local import session, never shared with application caches. */
export async function createAuthorizedDauEnglishSource({ baseUrl, publicKey, accessToken, fetcher = fetch }) {
  if (baseUrl !== DAUENGLISH_SOURCE_URL || !publicKey?.startsWith("sb_publishable_")) throw new Error("The current public Dau English connection is required.");
  if (typeof accessToken !== "string" || !accessToken.trim()) throw new Error("Missing DAUENGLISH_IMPORT_ACCESS_TOKEN for authorized import.");
  const headers = { apikey: publicKey, Authorization: `Bearer ${accessToken.trim()}`, Accept: "application/json", "Content-Type": "application/json" };
  /**
   * @param {string} path
   * @param {{method?: string, params?: Record<string, unknown>, body?: unknown, headers?: Record<string, string>}} options
   */
  const request = async (path, { method = "GET", params = {}, body, headers: additionalHeaders = {} } = {}) => {
    if (!path.startsWith("/rest/v1/") && path !== "/auth/v1/user") throw new Error("Unsupported Dau English import endpoint.");
    if (Object.keys(additionalHeaders).some(key => !["prefer", "range", "range-unit"].includes(key.toLowerCase()))) throw new Error("Unsupported Dau English import request header.");
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetcher(url.toString(), { method, headers: { ...headers, ...additionalHeaders }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new Error("Authorized Dau English request failed; no anonymous fallback was attempted."); }
    if (!response.ok) throw new Error(`Authorized Dau English request returned ${response.status}; import stopped.`);
    let data;
    try { data = await response.json(); } catch { throw new Error("Invalid authorized Dau English response."); }
    return { data, httpDate: response.headers.get("date"), headers: response.headers };
  };
  const { data: user } = await request("/auth/v1/user");
  if (!user?.id || typeof user.email !== "string" || user.email.trim().toLowerCase() !== EXPECTED_EMAIL) throw new Error("The import session does not belong to the authorized Dau English account.");
  return { request };
}

const text = value => value == null ? null : String(value);
const integer = value => value == null ? null : Number(value);
function array(value) {
  if (value == null) return [];
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error("Invalid vocabulary array from authorized source.");
  return parsed;
}

/** Fetch only missing test IDs. Previously archived content stays authoritative. */
export async function downloadMissingAuthorizedVocabulary(client, catalog, archived) {
  const existing = new Set((archived?.catalog.tests ?? []).map(test => test.testId));
  const tests = catalog.tests.filter(test => !existing.has(test.testId));
  if (!tests.length) return null;
  if (tests.some(test => test.partCount <= 0 || test.wordCount <= 0)) throw new Error("Authorized source contains an empty vocabulary test.");
  const parts = [];
  for (const test of tests) {
    const { data } = await client.request("/rest/v1/vocabulary_parts", { params: { select: "id,test_id,name,order_index", test_id: `eq.${test.testId}`, order: "order_index.asc" } });
    if (!Array.isArray(data) || data.length !== test.partCount || data.some(row => row.test_id !== test.testId || typeof row.id !== "string" || !row.id)) throw new Error("Invalid or incomplete authorized vocabulary parts.");
    parts.push(...data.map(row => ({ id: text(row.id) ?? "", testId: text(row.test_id), name: text(row.name), orderIndex: integer(row.order_index) })));
  }
  const words = [];
  if (new Set(parts.map(part => part.id)).size !== parts.length) throw new Error("Duplicate authorized vocabulary part IDs.");
  // One part per request avoids silent PostgREST row caps across a large batch.
  for (const part of parts) {
    const { data } = await client.request("/rest/v1/rpc/get_vocab_words_for_part_fast", { method: "POST", body: { p_part_id: part.id } });
    if (!Array.isArray(data)) throw new Error("Invalid authorized vocabulary words.");
    words.push(...data.map(row => ({ id: text(row.id) ?? "", partId: text(row.part_id), word: text(row.word), ipa: text(row.ipa),
      audioUrl: text(row.audio_url), audioUsUrl: text(row.audio_us), audioUkUrl: text(row.audio_uk), imageUrl: text(row.image_url),
      meanings: array(row.meanings), phrases: array(row.phrases), synonyms: array(row.synonyms), orderIndex: integer(row.order_index), difficultyLevel: integer(row.difficulty_level) })));
  }
  return vocabularySnapshotSchema.parse({ accessScope: "provider-authorized", catalog: { sets: catalog.sets, tests }, parts, words });
}
