import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionDictionary from "./SelectionDictionary";
import { loadDictionaryBasket } from "@/lib/dictionary-word-basket";

const word = { word: "online", lemma: "online", meaning_vi: "trực tuyến", pos: "adv", ipa_us: "/ɑːnˈlaɪn/", ipa_uk: "/ɒnˈlaɪn/", example_en: "You can book online.", example_vi: "Bạn có thể đặt trực tuyến.", collocations: [{ en: "book online", vi: "đặt trực tuyến" }], synonym: [{ en: "on the internet", vi: "trên internet" }], antonym: [{ en: "offline", vi: "ngoại tuyến" }] };
const context = { id: "question-2", title: "Ngữ pháp · Danh từ", sentence: "Growth in online sales has exceeded expectations." };
const props = { learnerId: "alice", vocabulary: { vocabulary: [word] }, vocabularyPool: [], context };
function selectText(element: Element) {
  const range = document.createRange(); range.selectNodeContents(element);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.pointerUp(element);
}
async function manualLookup(term: string) {
  fireEvent.click(screen.getByRole("button", { name: "Tra từ" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Từ tiếng Anh cần tra" }), { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "Tra" }));
}
describe("selection dictionary", () => {
  beforeEach(() => { localStorage.clear(); window.getSelection()?.removeAllRanges(); });
  afterEach(() => { vi.unstubAllGlobals(); window.getSelection()?.removeAllRanges(); });
  it("looks up selected lesson text locally, preserves vocabulary details and saves the sentence for review", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<SelectionDictionary {...props}><p data-testid="lesson-word">online</p></SelectionDictionary>);
    selectText(screen.getByTestId("lesson-word"));
    const dialog = await screen.findByRole("dialog", { name: "online" });
    expect(within(dialog).getByText("Từ vựng trong câu này")).toBeInTheDocument();
    expect(within(dialog).getByText("trực tuyến")).toBeInTheDocument();
    expect(within(dialog).getByText("You can book online.")).toBeInTheDocument();
    expect(within(dialog).getByText("ngoại tuyến", { exact: false })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "＋ Thêm thẻ vào giỏ" }));
    expect(loadDictionaryBasket("alice").items[0]).toMatchObject({ entry: { word: "online", meaning: "trực tuyến" }, contexts: [context] });
    expect(loadDictionaryBasket("bob").items).toEqual([]);
  });
  it("ignores selection outside the lesson and inside explicit excluded controls", async () => {
    render(<><p data-testid="outside">online</p><SelectionDictionary {...props}><p data-testid="excluded" data-dictionary-ignore>online</p></SelectionDictionary></>);
    selectText(screen.getByTestId("outside"));
    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    selectText(screen.getByTestId("excluded"));
    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("still recognizes touch selection after a canceled pointer gesture", async () => {
    render(<SelectionDictionary {...props}><p data-testid="touch-word">online</p></SelectionDictionary>);
    const element = screen.getByTestId("touch-word");
    fireEvent.pointerDown(element); fireEvent.pointerCancel(element);
    const range = document.createRange(); range.selectNodeContents(element);
    window.getSelection()!.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    expect(await screen.findByRole("dialog", { name: "online" })).toBeInTheDocument();
  });
  it("searches the grammar library before any external lookup and caches successful results", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { entry: { word: "online", lemma: "online", meaning: "trực tuyến", partOfSpeech: "adv", phonetic: "", phoneticUs: "", phoneticUk: "", audioUrl: "", audioUsUrl: "", audioUkUrl: "", example: "", exampleTranslation: "", phrases: [], synonyms: [], antonyms: [], wordFamily: [], source: "Từ vựng ngữ pháp" }, scope: "library", match: "exact", matchedWord: "online" } }) });
    vi.stubGlobal("fetch", fetcher);
    render(<SelectionDictionary {...props} vocabulary={null}><p>Lesson</p></SelectionDictionary>);
    await manualLookup("online");
    await screen.findByText("Từ vựng ngữ pháp", { exact: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/grammar/dictionary?word=online");
    fireEvent.click(screen.getByRole("button", { name: "Đóng tra từ" }));
    await manualLookup("online");
    expect(screen.getByText("trực tuyến")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses a verified dictionary fallback only for a missing library word", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { word: "business", meaning: "kinh doanh", partOfSpeech: "N", phonetic: "/ˈbɪznəs/", source: "Free Dictionary API" } }) });
    vi.stubGlobal("fetch", fetcher);
    render(<SelectionDictionary {...props} vocabulary={null}><p>Lesson</p></SelectionDictionary>);
    await manualLookup("business");
    await screen.findByText("kinh doanh");
    expect(screen.getByText("Từ điển tham khảo")).toBeInTheDocument();
    expect(screen.getByText(/Nghĩa tham khảo/)).toBeInTheDocument();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/grammar/dictionary?word=business", "/api/vocab/dictionary?word=business"]);
  });
  it("never replaces the newest local lookup with a slow response from an older lookup", async () => {
    let resolveOld!: (response: unknown) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveOld = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    render(<SelectionDictionary {...props}><p>Lesson</p></SelectionDictionary>);
    await manualLookup("unknown");
    fireEvent.click(screen.getByRole("button", { name: "Đóng tra từ" }));
    await manualLookup("online");
    expect(screen.getByText("trực tuyến")).toBeInTheDocument();
    await act(async () => { resolveOld({ ok: false, status: 500 }); });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "online" })).toBeInTheDocument();
  });
  it("does not start a fallback voice when an old audio request rejects after closing", async () => {
    let rejectAudio!: (reason: Error) => void;
    const paused = vi.fn();
    vi.stubGlobal("Audio", class { pause = paused; play = () => new Promise<void>((_, reject) => { rejectAudio = reject; }); });
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [] });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
    render(<SelectionDictionary {...props} vocabulary={{ vocabulary: [{ ...word, audioUsUrl: "https://example.com/online.mp3" }] }}><p>Lesson</p></SelectionDictionary>);
    await manualLookup("online");
    fireEvent.click(screen.getByRole("button", { name: /^🔊 Mỹ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng tra từ" }));
    expect(paused).toHaveBeenCalled();
    await act(async () => { rejectAudio(new Error("Aborted playback")); });
    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
