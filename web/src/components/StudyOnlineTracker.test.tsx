import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readOnlinePresence } from "@/lib/client-online-presence";
import { readStudyStreakCache, studyDateKey } from "@/lib/client-study-streak-cache";
import StudyOnlineTracker from "./StudyOnlineTracker";

let visible = true;
let uidNumber = 0;
let credited = 0;
const response = (seconds: number, active = true) => ({ ok: true, json: async () => ({ success: true, data: {
  authenticated: true, onlineSecondsToday: seconds, totalOnlineSeconds: seconds,
  ownsSession: active, todayDateKey: studyDateKey(), studiedToday: seconds >= 600,
  streakDays: seconds >= 600 ? 1 : 0, todayActivityCount: 0,
} }) }) as Response;
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = async () => act(async () => { await Promise.resolve(); });
const learner = () => `online-test-${++uidNumber}`;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T05:00:00Z"));
  visible = true; credited = 0;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    credited += body.elapsedSeconds;
    return response(credited, body.active);
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("updates locally each second and saves once per thirty seconds, continuing beyond ten minutes", async () => {
  const uid = learner(); render(<StudyOnlineTracker uid={uid} />); await settle();
  await advance(10000);
  expect(readOnlinePresence(uid)?.seconds).toBe(10);
  expect(fetch).toHaveBeenCalledTimes(1);
  await advance(590000);
  expect(readStudyStreakCache(uid)?.data.studiedToday).toBe(true);
  expect(readOnlinePresence(uid)?.seconds).toBe(600);
  await advance(30000);
  expect(readOnlinePresence(uid)?.seconds).toBe(630);
});

it("flushes when hidden, pauses and resumes without counting the hidden interval", async () => {
  const uid = learner(); render(<StudyOnlineTracker uid={uid} />); await settle(); await advance(10000);
  visible = false; fireEvent(document, new Event("visibilitychange")); await settle();
  expect(readOnlinePresence(uid)).toMatchObject({ seconds: 10, running: false });
  await advance(120000);
  expect(readOnlinePresence(uid)?.seconds).toBe(10);
  visible = true; fireEvent(document, new Event("visibilitychange")); await settle(); await advance(5000);
  expect(readOnlinePresence(uid)).toMatchObject({ seconds: 15, running: true });
});

it("does not move the counter backwards while a save response is in flight", async () => {
  const uid = learner(); render(<StudyOnlineTracker uid={uid} />); await settle();
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  await advance(31000);
  expect(readOnlinePresence(uid)?.seconds).toBe(31);
  await act(async () => resolve(response(30)));
  expect(readOnlinePresence(uid)?.seconds).toBe(31);
});

it("replays the same sequence on network failure and waits for server confirmation", async () => {
  const uid = learner(); render(<StudyOnlineTracker uid={uid} />); await settle();
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Network interrupted"));
  await advance(30000);
  const failed = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
  expect(readOnlinePresence(uid)).toMatchObject({ synced: false, running: false });
  await advance(30000);
  const retry = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
  expect(retry).toEqual(failed);
  expect(readOnlinePresence(uid)?.seconds).toBe(30);
});

it("ignores a late response after switching accounts", async () => {
  const first = learner(), second = learner();
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const view = render(<StudyOnlineTracker uid={first} />); await settle();
  view.rerender(<StudyOnlineTracker uid={second} />); await settle();
  await act(async () => resolve(response(600)));
  expect(readStudyStreakCache(first)).toBeNull();
  expect(readOnlinePresence(second)?.seconds).toBe(0);
});

it("does not count a suspended clock jump or carry yesterday's displayed seconds forward", async () => {
  vi.setSystemTime(new Date("2026-10-07T16:59:50Z"));
  const uid = learner(); render(<StudyOnlineTracker uid={uid} />); await settle(); await advance(5000);
  vi.setSystemTime(new Date("2026-10-07T17:10:00Z"));
  await advance(1000);
  expect(readOnlinePresence(uid)).toMatchObject({ dateKey: "2026-10-08", seconds: 0 });
});
