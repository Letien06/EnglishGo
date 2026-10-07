import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReadingProgressQueue, type ReadingProgressAction } from "./reading-progress-queue";

vi.mock("./client-learning-progress-cache", () => ({ invalidateLearningLevels: vi.fn() }));
const action: ReadingProgressAction = { part: 5, level: 1, testId: "source-test", itemId: "item", questionId: "q1", selectedAnswer: "B", correctAnswer: "B", modeUsed: "bilingual", assistPercent: 0, elapsedSeconds: 12 };
let next = 0;
const learner = () => `reading-queue-test-${++next}`;
const storageKey = (uid: string) => `englishgo:reading-progress-queue:${encodeURIComponent(uid)}`;
const storedEntries = (uid: string) => Object.keys(localStorage).filter((key) => key.startsWith(`${storageKey(uid)}:`)).map((key) => JSON.parse(localStorage.getItem(key)!));
function Harness({ uid, authenticated = true }: { uid: string | null; authenticated?: boolean }) {
  const queue = useReadingProgressQueue(uid, authenticated);
  return <><span data-testid="pending">{queue.pendingCount}</span><span data-testid="error">{queue.error}</span><button onClick={() => queue.enqueue(action)}>Answer</button><button onClick={() => queue.enqueue({ ...action, questionId: "q2" })}>Answer second</button><button onClick={queue.retry}>Retry</button></>;
}
function ack(options?: RequestInit, overrides: Record<string, unknown> = {}) {
  const sent = JSON.parse(options!.body as string);
  return new Response(JSON.stringify({ success: true, data: { saved: true, authenticated: true, uid: sent.expectedUid, requestId: sent.requestId, ...overrides } }), { status: 200 });
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); });
afterEach(async () => { cleanup(); await tick(15_000); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps immutable actions through a lost response and serializes subsequent answers", async () => {
  const uid = learner();
  let calls = 0;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (++calls === 1) throw new Error("Lost successful response");
    return ack(options);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  fireEvent.click(screen.getByText("Answer second"));
  await tick();
  expect(screen.getByTestId("pending")).toHaveTextContent("2");
  const stored = storedEntries(uid);
  expect(stored).toHaveLength(2);
  expect(stored[0].action).toEqual(action);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).answeredAtMillis).toBe(stored[0].queuedAt);
  fireEvent.click(screen.getByText("Retry"));
  await tick(1);
  expect(fetcher.mock.calls[1][1]!.body).toBe(fetcher.mock.calls[0][1]!.body);
  expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string).questionId).toBe("q2");
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
  expect(localStorage.getItem(storageKey(uid))).toBeNull();
});

it("restores a persisted receipt after reload and sends it only when online", async () => {
  const uid = learner(), requestId = crypto.randomUUID();
  localStorage.setItem(storageKey(uid), JSON.stringify([{ action, requestId }]));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<Harness uid={uid} />);
  await tick();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  view.unmount();
  render(<Harness uid={uid} />);
  online.mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await tick();
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ ...action, requestId, expectedUid: uid, answeredAtMillis: 0 });
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});

it("preserves another tab's durable answer while enqueueing and acknowledging its own answer", async () => {
  const uid = learner();
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  const foreignId = crypto.randomUUID();
  localStorage.setItem(`${storageKey(uid)}:${foreignId}`, JSON.stringify({ requestId: foreignId, queuedAt: 1, action: { ...action, questionId: "other-tab-question" } }));
  fireEvent.click(screen.getByText("Answer"));
  expect(storedEntries(uid)).toHaveLength(2);
  online.mockReturnValue(true);
  fireEvent.click(screen.getByText("Retry"));
  await tick(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ requestId: foreignId, questionId: "other-tab-question" });
  expect(storedEntries(uid)).toHaveLength(0);
});

it("replays persisted answers by immutable order even when keys enumerate newest first", async () => {
  const uid = learner();
  const newer = { requestId: crypto.randomUUID(), queuedAt: 20, action: { ...action, selectedAnswer: "A" } };
  const older = { requestId: crypto.randomUUID(), queuedAt: 10, action };
  localStorage.setItem(`${storageKey(uid)}:${newer.requestId}`, JSON.stringify(newer));
  localStorage.setItem(`${storageKey(uid)}:${older.requestId}`, JSON.stringify(older));
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  await tick(1);
  expect(fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).selectedAnswer)).toEqual(["B", "A"]);
});

it("reconciles deleted durable records without resurrecting them or writing on storage events", async () => {
  const uid = learner();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  const [entry] = storedEntries(uid);
  localStorage.removeItem(`${storageKey(uid)}:${entry.requestId}`);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  fireEvent(window, new StorageEvent("storage", { key: `${storageKey(uid)}:${entry.requestId}` }));
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
  expect(writes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Retry"));
  fireEvent.click(screen.getByText("Answer second"));
  expect(storedEntries(uid)).toHaveLength(1);
  expect(storedEntries(uid)[0].action.questionId).toBe("q2");
});

it("bounds a stalled response body and retries with backoff using the same request ID", async () => {
  const uid = learner();
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise(() => {}) }).mockImplementation(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  await tick();
  await tick(15_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((fetcher.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  await tick(999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});

it("pauses nontransient failures and refuses mismatched acknowledgments", async () => {
  const uid = learner();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 400 })).mockImplementationOnce(async (_url: string, options?: RequestInit) => ack(options, { uid: "another-learner" })).mockImplementation(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  await tick(60_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Retry"));
  await tick(60_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  fireEvent.click(screen.getByText("Retry"));
  await tick();
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});

it("does not send old-account actions after switching learners or queue guest answers", async () => {
  const old = learner(), current = learner();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<Harness uid={old} />);
  fireEvent.click(screen.getByText("Answer"));
  view.rerender(<Harness uid={current} />);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await tick();
  expect(fetcher).not.toHaveBeenCalled();
  expect(storedEntries(old)).toHaveLength(1);
  view.rerender(<Harness uid={null} authenticated={false} />);
  fireEvent.click(screen.getByText("Answer"));
  await tick();
  expect(fetcher).not.toHaveBeenCalled();
});

it("retains the in-memory action and reports failed device storage", async () => {
  const uid = learner();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  vi.stubGlobal("fetch", vi.fn());
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  expect(screen.getByTestId("error")).toHaveTextContent("Hãy giữ trang mở");
});

it("keeps the receipt when the server acknowledges another request", async () => {
  const uid = learner();
  const fetcher = vi.fn().mockImplementationOnce(async (_url: string, options?: RequestInit) => ack(options, { requestId: "different-request" })).mockImplementation(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  render(<Harness uid={uid} />);
  fireEvent.click(screen.getByText("Answer"));
  await tick();
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  fireEvent.click(screen.getByText("Retry"));
  await tick();
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});

it("ignores a late acknowledgment after account switch and replays the original receipt on return", async () => {
  const old = learner(), current = learner();
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>((done) => { resolve = done; });
  const fetcher = vi.fn().mockReturnValueOnce(pending).mockImplementation(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<Harness uid={old} />);
  fireEvent.click(screen.getByText("Answer"));
  await tick();
  view.rerender(<Harness uid={current} />);
  await act(async () => resolve(ack(fetcher.mock.calls[0][1])));
  await tick();
  expect(storedEntries(old)).toHaveLength(1);
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
  view.rerender(<Harness uid={old} />);
  await tick();
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(storedEntries(old)).toHaveLength(0);
});
