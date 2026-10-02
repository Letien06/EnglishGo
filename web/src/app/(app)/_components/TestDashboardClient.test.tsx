import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedSessionProvider } from "@/components/AuthenticatedSessionContext";
import { setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";
import TestDashboardClient from "./TestDashboardClient";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

const tests: DauToeicPartTest[] = [
  { testId: "vol1-test1", testName: "Test 1", setName: "Vol 1", part: 1, questionCount: 6, itemCount: 6, done: 0, correct: 0, wrong: 0, nextIndex: 0 },
  { testId: "vol2-test1", testName: "Test 1", setName: "Vol 2", part: 1, questionCount: 6, itemCount: 6, done: 0, correct: 0, wrong: 0, nextIndex: 0 },
];
function Dashboard({ authenticated = false }: { authenticated?: boolean }) {
  return <AuthenticatedSessionProvider authenticated={authenticated}><TestDashboardClient skill="listening" part={1} initialTests={tests} initialError={false} /></AuthenticatedSessionProvider>;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("test selection dashboard", () => {
  it("renders immediately and links identical test names to different source IDs without levels", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Dashboard />);
    expect(screen.getByRole("region", { name: "Vol 1" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vol 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 1" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=vol1-test1&mode=normal&q=0");
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 2" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=vol2-test1&mode=normal&q=0");
    expect(screen.queryByText(/Cấp|Nhóm/)).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not block opening a test while private history is loading", async () => {
    setActiveLearnerId("learner");
    const fetcher = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetcher);
    render(<Dashboard authenticated />);
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 1" })).toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/listening/tests?part=1", expect.anything()));
  });

  it("isolates progress across accounts and rejects a delayed response for another account", async () => {
    setActiveLearnerId("first-learner");
    let resolveSecond!: (value: unknown) => void;
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ success: true, data: { uid: "first-learner", tests: [{ ...tests[0], done: 2, correct: 2, nextIndex: 2 }, tests[1]] } }),
    }).mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    render(<Dashboard authenticated />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Học tiếp Test 1 - Vol 1" })).toHaveAttribute("href", expect.stringContaining("q=2")));
    act(() => setActiveLearnerId("second-learner"));
    expect(within(screen.getByRole("region", { name: "Vol 1" })).getByText("0/6 đã học")).toBeInTheDocument();
    await act(async () => resolveSecond({ ok: true, json: async () => ({ success: true, data: { uid: "first-learner", tests: [{ ...tests[0], done: 6 }, tests[1]] } }) }));
    expect(within(screen.getByRole("region", { name: "Vol 1" })).getByText("0/6 đã học")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Chưa cập nhật");
  });
});
