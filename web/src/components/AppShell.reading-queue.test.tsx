import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/read/practice" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/reading-progress-queue", () => ({ useReadingProgressQueue: queue, useListeningProgressQueue: queue }));
vi.mock("@/lib/vocab-review-queue", () => ({ useVocabReviewQueue: () => ({}) }));
vi.mock("@/lib/client-learning-progress-cache", () => ({ setActiveLearnerId: vi.fn(), clearActiveLearnerCache: vi.fn() }));

import AppShell from "./AppShell";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("activates persisted reading answers on a direct practice visit using lightweight verified identity", async () => {
  vi.stubGlobal("React", React);
  vi.useFakeTimers();
  const fetcher = vi.fn((url: string) => url === "/api/study/presence"
    ? new Promise<Response>(() => {})
    : Promise.resolve({ ok: true, json: async () => ({
      success: true, data: { authenticated: true, user: { uid: "learner", displayName: "Learner", email: "", role: "USER" } },
    }) }));
  vi.stubGlobal("fetch", fetcher);
  render(<AppShell><main>Đang luyện đọc</main></AppShell>);
  expect(queue).toHaveBeenCalledWith(undefined, false);
  await act(async () => { await Promise.resolve(); });
  expect(queue).toHaveBeenLastCalledWith("learner", true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/app/bootstrap")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith("/api/study/presence", expect.objectContaining({ method: "POST" }));
  expect(screen.getByText("Đang luyện đọc")).toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
});
