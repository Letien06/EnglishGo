import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/services/grammar-dictionary", () => ({ lookupGrammarDictionary: mocks.lookup }));
import { GET } from "./route";
const request = (url: string) => GET(new NextRequest(url), { params: Promise.resolve({}) });
beforeEach(() => mocks.lookup.mockReset());
describe("public read-only grammar dictionary", () => {
  it("returns verified library metadata in the standard envelope without authentication", async () => {
    const found = { scope: "library", match: "exact", matchedWord: "online", entry: { word: "online", meaning: "trực tuyến", source: "Từ vựng ngữ pháp" } };
    mocks.lookup.mockResolvedValue(found);
    const response = await request("https://example.com/api/grammar/dictionary?word=online&topicId=nouns&questionId=q-2");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: found, error: null });
    expect(mocks.lookup).toHaveBeenCalledWith("online", { topicId: "nouns", questionId: "q-2" });
  });
  it("returns 404 for verified absence and rejects invalid selections/context before reading", async () => {
    mocks.lookup.mockResolvedValue(null);
    expect((await request("https://example.com/api/grammar/dictionary?word=unknownword")).status).toBe(404);
    mocks.lookup.mockClear();
    for (const query of ["word=", "word=one%20two%20three%20four%20five%20six", `word=${"x".repeat(80)}`, "word=online&questionId=%3Cscript%3E"]) expect((await request(`https://example.com/api/grammar/dictionary?${query}`)).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
