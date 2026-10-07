import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedSessionProvider } from "@/components/AuthenticatedSessionContext";
import { invalidateLearningLevels, setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";
import TestDashboardClient from "./TestDashboardClient";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("../listen/_components/useListeningStreak", () => ({ default: () => null }));
vi.mock("../listen/_components/useListeningPartProgress", () => ({ default: () => ({}) }));

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
  it("keeps loaded progress and the filtered cards in place during refresh and failure", async () => {
    setActiveLearnerId("refresh-learner");
    let resolveRefresh!: (value: unknown) => void;
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ success: true, data: { uid: "refresh-learner", tests: [{ ...tests[0], done: 2, correct: 2, nextIndex: 2 }, tests[1]] } }),
    }).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    render(<Dashboard authenticated />);
    await screen.findByRole("link", { name: "Học tiếp Test 1 - Vol 1" });
    fireEvent.click(screen.getByRole("button", { name: "Đang học 1" }));
    const card = screen.getByRole("article", { name: "Test 1 - Vol 1" });
    act(() => invalidateLearningLevels("listening", [1]));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Test 1 - Vol 1" })).toBe(card);
    expect(screen.getByRole("button", { name: "Đang học 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Học tiếp Test 1 - Vol 1" })).toHaveAttribute("href", expect.stringContaining("q=2"));
    await act(async () => resolveRefresh({ ok: false, json: async () => ({ success: false }) }));
    expect(screen.getByRole("article", { name: "Test 1 - Vol 1" })).toBe(card);
    expect(screen.getByRole("status", { name: "Trạng thái tiến độ" })).toHaveTextContent("Chưa cập nhật");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
  it("shares the new dashboard with reading while preserving practice routes", async () => {
    render(<AuthenticatedSessionProvider authenticated={false}><TestDashboardClient skill="reading" part={5} initialTests={tests.map((test) => ({ ...test, part: 5 }))} initialError={false} /></AuthenticatedSessionProvider>);
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 1" })).toHaveAttribute("href", "/read/practice?part=part5&testId=vol1-test1&mode=normal&q=0");
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tổng quan luyện đọc" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tổng quan luyện nghe" })).not.toBeInTheDocument();
    await act(async () => undefined);
  });
  it("renders immediately and links identical test names to different source IDs without levels", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Dashboard />);
    expect(screen.getByRole("region", { name: "Vol 1" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vol 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 1" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=vol1-test1&mode=normal&q=0");
    expect(screen.getByRole("link", { name: "Bắt đầu Test 1 - Vol 2" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=vol2-test1&mode=normal&q=0");
    expect(screen.queryByText(/Cấp|Nhóm/)).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => undefined);
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
    expect(within(screen.getByRole("region", { name: "Vol 1" })).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    await act(async () => resolveSecond({ ok: true, json: async () => ({ success: true, data: { uid: "first-learner", tests: [{ ...tests[0], done: 6 }, tests[1]] } }) }));
    expect(within(screen.getByRole("region", { name: "Vol 1" })).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("status", { name: "Trạng thái tiến độ" })).toHaveTextContent("Chưa cập nhật");
  });
});
