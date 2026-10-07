import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AudioDictationClient, { readAudioDictationProgress } from "./AudioDictationClient";
import type { DictationSet } from "@/lib/storage/dictation-snapshot";
const session: DictationSet = { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", setId: "set", items: ["one", "two"].map(id => ({ id, setId: "set", orderIndex: 0, audioUrl: `https://example.com/${id}.mp3`, transcript: "Hello world.", translationVi: "Xin chào", hint: null, vocabulary: null, durationSeconds: null, groupId: null })) };
const set = { id: "set", name: "Test", part: 1, accessLevel: "pro" as const, orderIndex: 0, collectionName: null, chapterName: null, subtitle: null, itemCount: 2 };
beforeEach(() => localStorage.clear());
describe("audio dictation practice", () => {
  it("grades, reveals translation, saves progress per learner, clears next answer", async () => {
    render(<AudioDictationClient set={set} session={session} learnerId="learner" />);
    await waitFor(() => expect(screen.getByText("Kiểm tra")).toBeEnabled());
    expect(screen.queryByText("Xin chào")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Câu bạn nghe"), { target: { value: "hello world" } });
    fireEvent.click(screen.getByText("Kiểm tra"));
    expect(screen.getByText("Chính xác!")).toBeInTheDocument();
    expect(screen.getByText("Xin chào")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("englishweb:audio-dictation:v1:learner:set")!).completed).toEqual(["one"]));
    fireEvent.click(screen.getByText("Câu tiếp →"));
    expect(screen.getByLabelText("Câu bạn nghe")).toHaveValue("");
    expect(screen.queryByText("Xin chào")).not.toBeInTheDocument();
    expect(screen.getByText(/Câu 2\/2/)).toBeInTheDocument();
  });
  it("restores valid progress and rejects corrupt/outdated storage", async () => {
    expect(readAudioDictationProgress('{"index":99,"completed":[]}', session)).toEqual({ index: 0, completed: [] });
    expect(readAudioDictationProgress('{"index":1,"completed":["one","old","one"]}', session)).toEqual({ index: 1, completed: ["one"] });
    localStorage.setItem("englishweb:audio-dictation:v1:guest:set", '{"index":1,"completed":["one"]}');
    render(<AudioDictationClient set={set} session={session} learnerId="guest" />);
    await waitFor(() => expect(screen.getByText(/Câu 2\/2/)).toBeInTheDocument());
    expect(screen.getByText("Câu tiếp →")).toBeDisabled();
  });
  it("preserves audio but cannot grade or mark a source item with no transcript", async () => {
    const missing = { ...session, items: [{ ...session.items[0], transcript: "", transcriptMissing: true as const }, session.items[1]] };
    expect(readAudioDictationProgress('{"index":0,"completed":["one"]}', missing).completed).toEqual([]);
    render(<AudioDictationClient set={set} session={missing} learnerId="guest" />);
    await waitFor(() => expect(screen.getByText("Câu tiếp →")).toBeEnabled());
    expect(screen.getByText("Kiểm tra")).toBeDisabled();
    expect(screen.getByText(/Nguồn chưa có bản chép/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Câu tiếp →"));
    expect(screen.getByText("Kiểm tra")).toBeEnabled();
  });
});
