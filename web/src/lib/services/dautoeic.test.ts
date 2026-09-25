import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {} }));

import { serverEnv } from "../env";
import { dauToeicApiHeaders } from "./dautoeic-source";
import {
  fetchListeningDifficultyLevelsFromSource,
  fetchListeningDifficultySessionFromSource,
  fetchReadingDifficultyLevelsFromSource,
  fetchReadingDifficultySessionFromSource,
  fetchSetsFromSource,
} from "./dautoeic";
import { getVocabularyCatalog } from "./dautoeic-vocab";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("DAUTOEIC_SUPABASE_URL", "https://odlnhfaygiotcyehuysw.supabase.co");
  vi.stubEnv("DAUTOEIC_ANON_KEY", "sb_publishable_test");
  vi.stubEnv("DAUTOEIC_MEDIA_BASE_URL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function mockPart(part: number, count = 1) {
  const passageBased = [3, 4, 6, 7].includes(part);
  const ids = Array.from({ length: count }, (_, index) => `readable-${index}`);
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/get_practice_stats_page")) {
      const body = JSON.parse(String(init?.body));
      return jsonResponse(["hidden", ...ids].slice(body.p_offset, body.p_offset + body.p_limit).map((id) => ({
        item_id: id,
        part,
        item_type: passageBased ? "passage" : "question",
        difficulty_level: 1,
        total_attempts: 10,
        wrong_count: 1,
        error_rate: 10,
      })));
    }
    if (url.searchParams.get("select") === "id") {
      const offset = Number(url.searchParams.get("offset"));
      return jsonResponse(ids.slice(offset, offset + 1000).map((id) => ({ id })));
    }
    if (url.pathname.endsWith("/mock_tests")) {
      return jsonResponse([{ id: "test", name: "Test 1", media_folder: "Crack/Test 1" }]);
    }
    const filter = url.searchParams.get("id") ?? url.searchParams.get("passage_id") ?? "";
    const selectedIds = ids.filter((id) => filter.slice(4, -1).split(",").includes(id));
    if (url.pathname.endsWith("/mock_test_passages")) {
      return jsonResponse(selectedIds.map((id) => ({
        id, test_id: "test", part, transcript: "A short conversation.", audio_url: "1.mp3",
      })));
    }
    return jsonResponse(selectedIds.map((id) => ({
      id: passageBased ? `question-${id}` : id,
      test_id: "test",
      passage_id: passageBased ? id : null,
      part,
      question_text: "Choose the correct answer.",
      option_a: "Answer A",
      option_b: "Answer B",
      correct_answer: "A",
      audio_url: "1.mp3",
      image_url: "1.webp",
    })));
  });
}

describe("Dau English connection", () => {
  it("uses the new project by default and derives its media URL", () => {
    vi.stubEnv("DAUTOEIC_SUPABASE_URL", "");
    expect(serverEnv.dauToeicSupabaseUrl).toBe("https://odlnhfaygiotcyehuysw.supabase.co");
    expect(serverEnv.dauToeicMediaBaseUrl).toBe(
      "https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media",
    );
  });

  it("keeps explicit API and media overrides", () => {
    vi.stubEnv("DAUTOEIC_SUPABASE_URL", "https://custom.supabase.co/");
    expect(serverEnv.dauToeicMediaBaseUrl).toBe(
      "https://custom.supabase.co/storage/v1/object/public/mock-test-media",
    );
    vi.stubEnv("DAUTOEIC_MEDIA_BASE_URL", "https://media.example.com");
    expect(serverEnv.dauToeicMediaBaseUrl).toBe("https://media.example.com");
  });

  it("does not send a publishable key as a bearer JWT", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await fetchSetsFromSource();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/odlnhfaygiotcyehuysw\.supabase\.co\/rest\/v1\//);
    expect(init?.headers).toMatchObject({ apikey: "sb_publishable_test" });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(init?.signal).toBeDefined();
  });

  it("still supports legacy JWT anon keys", () => {
    expect(dauToeicApiHeaders("eyJ.legacy.signature")).toMatchObject({
      apikey: "eyJ.legacy.signature",
      Authorization: "Bearer eyJ.legacy.signature",
    });
  });

  it("uses the same publishable-key authentication for vocabulary", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sets: [], tests: [] }));
    await expect(getVocabularyCatalog()).resolves.toEqual({ sets: [], tests: [] });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ apikey: "sb_publishable_test" });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(init?.signal).toBeDefined();
  });

  it("fails clearly when the key is missing", async () => {
    vi.stubEnv("DAUTOEIC_ANON_KEY", "");
    await expect(fetchSetsFromSource()).rejects.toThrow("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps upstream HTTP errors visible", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchSetsFromSource()).rejects.toThrow("DauToeic API error (401)");
  });

  it("retains the existing network-error diagnostics", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause }));
    await expect(fetchSetsFromSource()).rejects.toThrow("[ENOTFOUND]");
  });
});

describe("publicly readable practice content", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("excludes hidden Part %i items before applying the limit", async (part) => {
    mockPart(part);
    const session = part <= 4
      ? await fetchListeningDifficultySessionFromSource(part, 1, 1)
      : await fetchReadingDifficultySessionFromSource(part, 1, 1);
    expect(session.total).toBe(1);
    expect(session.items).toHaveLength(1);
    expect(session.items[0].id).toBe("readable-0");
    expect(session.items[0].questions[0].questionText).toBe("Choose the correct answer.");
    expect(session.items[0].audioUrl).toBe(
      "https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media/Crack/Test%201/1.mp3",
    );
    const availabilityCall = fetchMock.mock.calls.find(([input]) => new URL(String(input)).searchParams.get("select") === "id");
    expect(String(availabilityCall?.[0])).toContain([1, 2, 5].includes(part) ? "mock_test_questions" : "mock_test_passages");
  });

  it.each([1, 5, 7])("counts only readable Part %i content in difficulty levels", async (part) => {
    mockPart(part, 3);
    const levels = part <= 4
      ? await fetchListeningDifficultyLevelsFromSource(part)
      : await fetchReadingDifficultyLevelsFromSource(part);
    expect(levels[0].total).toBe(3);
    expect(levels).toHaveLength(4);
    expect(levels[0].title).toBe("Level 1 — Dưới 200");
    expect(levels[0].itemIds).toEqual(["readable-0", "readable-1", "readable-2"]);
    expect(levels[0].totalAttempts).toBe(30);
    expect(levels[1].total).toBe(0);
    expect(levels[1].itemIds).toEqual([]);
  });

  it("paginates readable IDs instead of truncating the catalog at 1000", async () => {
    mockPart(5, 1001);
    const levels = await fetchReadingDifficultyLevelsFromSource(5);
    expect(levels[0].total).toBe(1001);
    const offsets = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.searchParams.get("select") === "id")
      .map((url) => url.searchParams.get("offset"));
    expect(offsets).toEqual(["0", "1000"]);
    const statsOffsets = fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/get_practice_stats_page"))
      .map(([, init]) => JSON.parse(String(init?.body)).p_offset);
    expect(statsOffsets).toEqual([0, 1000]);
  });

  it.each([0, 5, 1.5, NaN])("rejects unsupported difficulty level %s before fetching", async (level) => {
    await expect(fetchListeningDifficultySessionFromSource(1, level)).rejects.toThrow("between 1 and 4");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches ID lookups so larger sessions do not exceed URL limits", async () => {
    mockPart(5, 205);
    const session = await fetchReadingDifficultySessionFromSource(5, 1);
    expect(session.total).toBe(205);
    const batchSizes = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/mock_test_questions") && url.searchParams.has("id"))
      .map((url) => url.searchParams.get("id")!.slice(4, -1).split(",").length);
    expect(batchSizes).toEqual([100, 100, 5]);
  });
});
