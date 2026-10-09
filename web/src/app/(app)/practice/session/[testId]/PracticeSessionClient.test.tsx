import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeSessionView } from "@/lib/services/practice";
import { practiceDraftKey } from "@/lib/practice-draft-storage";
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/MobileNavigationMenu", () => ({ default: () => null }));
vi.mock("@/components/WorkspaceAnnotator", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div>, WorkspaceAnnotationAnchor: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/useDialogFocus", () => ({ default: () => undefined }));
import PracticeSessionClient from "./PracticeSessionClient";
const session: PracticeSessionView = {
  test: { id: 1, externalId: "one", title: "Exam", type: "exam", difficulty: null, duration: 18, totalQuestions: 1 },
  config: { mode: "part", parts: [5], durationMinutes: 18, sessionKey: "test" },
  questions: [{ id: 1, part: 5, skillType: "READING", type: "MULTIPLE_CHOICE", content: "Choose one", audioUrl: null, imageUrl: null, explanation: null, group: null }],
  optionsByQuestionId: { 1: [{ id: 65, content: "Answer A", correct: false }, { id: 66, content: "Answer B", correct: false }] },
  draftPayload: "{}", startedAtMillis: 10, serverNowMillis: 1000, expiresAtMillis: 1_000_000,
};
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(1000); vi.clearAllMocks(); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("exam draft UI", () => {
  it("marks answers immediately, shows pending save on 503, then retries without losing selection", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: "busy" }), { status: 503 })).mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true }))));
    vi.stubGlobal("fetch", fetcher);
    render(<PracticeSessionClient session={session} userUid="alice" />);
    fireEvent.click(screen.getByRole("radio", { name: "Answer A" }));
    expect(screen.getByRole("radio", { name: "Answer A" })).toBeChecked();
    expect(JSON.parse(localStorage.getItem(practiceDraftKey("alice", "test"))!).answers[1].selectedOptionId).toBe(65);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByRole("status")).toHaveTextContent("busy");
    fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("status")).toHaveTextContent("Đã đồng bộ bản nháp");
    expect(screen.getByRole("radio", { name: "Answer A" })).toBeChecked();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not adopt ownerless legacy answers or request the same draft again on mount", () => {
    localStorage.setItem("practice:test", JSON.stringify({ answers: { 1: { selectedOptionId: 65 } }, updatedAtMillis: 2000 }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<PracticeSessionClient session={session} userUid="bob" />);
    expect(screen.getByRole("radio", { name: "Answer A" })).not.toBeChecked();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
