import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publishStudyStreak, studyDateKey, type StudyStreakSnapshot } from "@/lib/client-study-streak-cache";
import { LEARNING_LEVELS_UPDATED_EVENT } from "@/lib/client-learning-progress-cache";
import StudyStreakBadge from "./StudyStreakBadge";

const navigation = vi.hoisted(() => ({ pathname: "/hub" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
let uidNumber = 0;
const nextUid = () => `learner-${++uidNumber}`;
const snapshot = (streakDays = 1, studiedToday = true): StudyStreakSnapshot => ({ streakDays, studiedToday, todayActivityCount: studiedToday ? 1 : 0, todayDateKey: studyDateKey(), authenticated: true });
const response = (data: StudyStreakSnapshot) => ({ ok: true, json: async () => ({ success: true, data }) }) as Response;
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { promise, resolve }; }
async function settle() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => {
  vi.stubGlobal("React", React); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T05:00:00Z"));
  navigation.pathname = "/hub"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(snapshot(2, false))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("refreshes leaderboard navigation and never reseeds the old bootstrap on later routes", async () => {
  const uid = nextUid(), seed = snapshot();
  const view = render(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  expect(fetch).not.toHaveBeenCalled();
  navigation.pathname = "/leaderboard";
  view.rerender(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay - hom nay chua hoc/)).toBeInTheDocument();
  navigation.pathname = "/read";
  view.rerender(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay - hom nay chua hoc/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("uses the original cache age when navigating so a seed cannot extend freshness", async () => {
  const uid = nextUid(), seed = snapshot();
  const view = render(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  vi.setSystemTime(Date.now() + 61_000);
  navigation.pathname = "/read"; view.rerender(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
});

it("refreshes expired focus and visibility data without restoring the bootstrap", async () => {
  const uid = nextUid(), seed = snapshot();
  render(<StudyStreakBadge uid={uid} initialStreak={seed} />); await settle();
  vi.setSystemTime(Date.now() + 61_000); fireEvent.focus(window); await settle();
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
  vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(3)));
  vi.setSystemTime(Date.now() + 61_000);
  fireEvent(document, new Event("visibilitychange")); await settle();
  expect(screen.getByLabelText(/Chuoi hoc 3 ngay/)).toBeInTheDocument();
});

it("refreshes at Vietnam midnight despite a fresh cache and clears the old today state", async () => {
  vi.setSystemTime(new Date("2026-10-07T16:59:50Z"));
  const uid = nextUid(), pending = deferred();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  render(<StudyStreakBadge uid={uid} initialStreak={snapshot()} />); await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/hom nay chua hoc/)).toBeInTheDocument();
  await act(async () => pending.resolve(response(snapshot(2, false))));
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
});

it("never displays a previous learner's cache or late response after an account switch", async () => {
  navigation.pathname = "/leaderboard";
  const oldUid = nextUid(), newUid = nextUid(), oldRequest = deferred(), newRequest = deferred();
  vi.mocked(fetch).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
  const view = render(<StudyStreakBadge uid={oldUid} initialStreak={snapshot(9)} />); await settle();
  view.rerender(<StudyStreakBadge uid={newUid} />); await settle();
  expect(screen.queryByLabelText(/Chuoi hoc 9 ngay/)).not.toBeInTheDocument();
  await act(async () => oldRequest.resolve(response(snapshot(10))));
  expect(screen.queryByLabelText(/Chuoi hoc 10 ngay/)).not.toBeInTheDocument();
  await act(async () => newRequest.resolve(response(snapshot(2, false))));
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
  view.rerender(<StudyStreakBadge uid={null} />);
  expect(screen.queryByLabelText(/Chuoi hoc/)).not.toBeInTheDocument();
});

it("refreshes saved learning events even inside the cache TTL and retains the current display", async () => {
  const uid = nextUid(), pending = deferred();
  render(<StudyStreakBadge uid={uid} initialStreak={snapshot()} />); await settle();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  act(() => window.dispatchEvent(new Event(LEARNING_LEVELS_UPDATED_EVENT)));
  expect(screen.getByLabelText(/Chuoi hoc 1 ngay/)).toBeInTheDocument();
  await act(async () => pending.resolve(response(snapshot(2))));
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
});

it("accepts a canonical leaderboard snapshot and prevents an older request from overwriting it", async () => {
  navigation.pathname = "/leaderboard";
  const uid = nextUid(), pending = deferred();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  render(<StudyStreakBadge uid={uid} initialStreak={snapshot()} />); await settle();
  act(() => publishStudyStreak(uid, snapshot(4, false)));
  expect(screen.getByLabelText(/Chuoi hoc 4 ngay - hom nay chua hoc/)).toBeInTheDocument();
  await act(async () => pending.resolve(response(snapshot(2))));
  expect(screen.getByLabelText(/Chuoi hoc 4 ngay/)).toBeInTheDocument();
});

it("reuses fresh canonical page data without a duplicate streak request", async () => {
  const uid = nextUid(); publishStudyStreak(uid, snapshot(5));
  navigation.pathname = "/leaderboard";
  render(<StudyStreakBadge uid={uid} initialStreak={snapshot()} />); await settle();
  expect(screen.getByLabelText(/Chuoi hoc 5 ngay/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("bounds a stalled response body and permits a later refresh", async () => {
  navigation.pathname = "/leaderboard";
  const uid = nextUid();
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) } as Response);
  render(<StudyStreakBadge uid={uid} initialStreak={snapshot()} />); await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  expect(screen.getByLabelText(/Chuoi hoc 1 ngay/)).toBeInTheDocument();
  vi.setSystemTime(Date.now() + 61_000); fireEvent.focus(window); await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText(/Chuoi hoc 2 ngay/)).toBeInTheDocument();
});
