import { describe, expect, it, vi } from "vitest";
import { createAuthorizedDauEnglishSource, DAUENGLISH_SOURCE_URL, downloadMissingAuthorizedVocabulary } from "../../scripts/lib/dauenglish-authorized-source.mjs";
import { mergeVocabularySnapshots } from "../../scripts/lib/vocabulary-merge.mjs";
import type { VocabularySnapshot } from "./storage/vocab-snapshot";

const connection = { baseUrl: DAUENGLISH_SOURCE_URL, publicKey: "sb_publishable_test_only", accessToken: "synthetic-session-only" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { date: "Thu, 08 Oct 2026 19:00:00 GMT" } });
const verifiedUser = { id: "synthetic-user", email: "letiendk06@gmail.com" };

function series(prefix: string, count: number, partCount: number, wordCount: number, group: string, accessLevel = "free"): VocabularySnapshot {
  const tests: VocabularySnapshot["catalog"]["tests"] = [];
  const parts: VocabularySnapshot["parts"] = [];
  const words: VocabularySnapshot["words"] = [];
  for (let index = 0; index < count; index++) {
    const testId = `${prefix}-${index}`;
    const testParts = Math.floor(partCount / count) + (index < partCount % count ? 1 : 0);
    let testWords = 0;
    for (let part = 0; part < testParts; part++) {
      const globalPart = parts.length;
      const id = `${testId}-part-${part}`;
      parts.push({ id, testId, name: `Part ${part + 1}`, orderIndex: part });
      const partWords = Math.floor(wordCount / partCount) + (globalPart < wordCount % partCount ? 1 : 0);
      testWords += partWords;
      for (let word = 0; word < partWords; word++) words.push({ id: `${id}-word-${word}`, partId: id, word: `word ${word}`, ipa: null, audioUrl: null, audioUsUrl: null, audioUkUrl: null, imageUrl: null, meanings: [{ meaning: "Nghĩa" }], phrases: [], synonyms: [], orderIndex: word, difficultyLevel: null });
    }
    tests.push({ testId, setId: group, name: testId, partCount: testParts, wordCount: testWords, orderIndex: index, accessLevel });
  }
  return { catalog: { sets: [{ id: group, name: group, orderIndex: 1 }], tests }, parts, words };
}

describe("explicit authorized Dau English import transport", () => {
  it("rejects missing tokens before making any request", async () => {
    const fetcher = vi.fn();
    await expect(createAuthorizedDauEnglishSource({ ...connection, accessToken: "", fetcher })).rejects.toThrow("Missing DAUENGLISH_IMPORT_ACCESS_TOKEN");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403])("stops rejected identity validation (%s) without anonymous fallback", async status => {
    const fetcher = vi.fn(async () => response({}, status));
    await expect(createAuthorizedDauEnglishSource({ ...connection, fetcher })).rejects.toThrow(`returned ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a session belonging to another account", async () => {
    const fetcher = vi.fn(async () => response({ ...verifiedUser, email: "other@example.com" }));
    await expect(createAuthorizedDauEnglishSource({ ...connection, fetcher })).rejects.toThrow("does not belong");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops a token that expires during content download without retrying anonymously", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(verifiedUser))
      .mockResolvedValueOnce(response({}, 401));
    const client = await createAuthorizedDauEnglishSource({ ...connection, fetcher });
    await expect(client.request("/rest/v1/rpc/get_vocab_words_for_part_fast", { method: "POST", body: { p_part_id: "part" } })).rejects.toThrow("returned 401");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses the verified process-local token on every request and supports exact-count headers", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(verifiedUser));
    const client = await createAuthorizedDauEnglishSource({ ...connection, fetcher });
    await client.request("/rest/v1/mock_tests", { params: { limit: 1000 }, headers: { Prefer: "count=exact" } });
    expect(fetcher.mock.calls[0][0]).toBe(`${DAUENGLISH_SOURCE_URL}/auth/v1/user`);
    expect(fetcher.mock.calls[1]).toEqual([`${DAUENGLISH_SOURCE_URL}/rest/v1/mock_tests?limit=1000`, expect.objectContaining({ cache: "no-store", redirect: "error", headers: expect.objectContaining({ apikey: connection.publicKey, Authorization: `Bearer ${connection.accessToken}`, Prefer: "count=exact" }) })]);
    await expect(client.request("/rest/v1/mock_tests", { headers: { Authorization: "Bearer other" } })).rejects.toThrow("Unsupported");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("sanitizes transport errors rather than exposing tokens or attempting fallback", async () => {
    const fetcher = vi.fn(async () => { throw new Error(connection.accessToken); });
    const error = await createAuthorizedDauEnglishSource({ ...connection, fetcher }).catch((failure: Error) => failure);
    expect(String(error)).not.toContain(connection.accessToken);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("missing-only authorized vocabulary delivery", () => {
  it("adds 9 Pro tests, 43 parts and 1504 words while retaining all archived IDs and content", async () => {
    const archived = series("archived", 94, 273, 10858, "existing");
    const incoming = series("missing", 9, 43, 1504, "pro", "pro");
    const catalog = { sets: [...archived.catalog.sets, ...incoming.catalog.sets], tests: [...archived.catalog.tests, ...incoming.catalog.tests] };
    const request = vi.fn(async (path: string, options: { params?: { test_id?: string }; body?: { p_part_id?: string } }) => {
      if (path === "/rest/v1/vocabulary_parts") return { data: incoming.parts.filter(part => `eq.${part.testId}` === options.params?.test_id).map(part => ({ id: part.id, test_id: part.testId, name: part.name, order_index: part.orderIndex })) };
      return { data: incoming.words.filter(word => word.partId === options.body?.p_part_id).map(word => ({ id: word.id, part_id: word.partId, word: word.word, meanings: word.meanings, order_index: word.orderIndex })) };
    });
    const added = await downloadMissingAuthorizedVocabulary({ request }, catalog, archived);
    const merged = mergeVocabularySnapshots(archived, added, catalog, { authorized: true });
    expect(merged.report).toMatchObject({ retainedTests: 94, addedTests: 9, totalTests: 103 });
    expect(merged.vocabulary).toMatchObject({ accessScope: "provider-authorized" });
    expect(merged.vocabulary.parts).toHaveLength(316);
    expect(merged.vocabulary.words).toHaveLength(12362);
    expect(merged.vocabulary.catalog.tests.slice(0, 94)).toEqual(archived.catalog.tests);
    expect(merged.vocabulary.parts.slice(0, 273)).toEqual(archived.parts);
    expect(merged.vocabulary.words.slice(0, 10858)).toEqual(archived.words);
    expect(merged.vocabulary.catalog.tests.slice(94).every(test => test.accessLevel === "pro")).toBe(true);
    expect(request).toHaveBeenCalledTimes(52);
    expect(JSON.stringify(request.mock.calls)).not.toContain("archived-");
    expect(JSON.stringify(merged)).not.toContain(connection.accessToken);
    expect(JSON.stringify(merged)).not.toContain(verifiedUser.email);
    expect(await downloadMissingAuthorizedVocabulary({ request }, catalog, merged.vocabulary)).toBeNull();
    expect(request).toHaveBeenCalledTimes(52);
    expect(mergeVocabularySnapshots(merged.vocabulary, null, catalog, { authorized: true }).vocabulary).toEqual(merged.vocabulary);
  });
  it("rejects incomplete or denied Pro content instead of producing a partial archive", async () => {
    const archived = series("old", 1, 1, 1, "old");
    const incoming = series("new", 1, 1, 1, "new", "pro");
    const denied = { request: vi.fn(async () => { throw new Error("Authorized Dau English request returned 403; import stopped."); }) };
    await expect(downloadMissingAuthorizedVocabulary(denied, incoming.catalog, archived)).rejects.toThrow("403");
    const empty = { request: vi.fn(async () => ({ data: [] })) };
    await expect(downloadMissingAuthorizedVocabulary(empty, incoming.catalog, archived)).rejects.toThrow();
  });
});
