import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installStudyBackGuard } from "./study-back-guard";

let guard: ReturnType<typeof installStudyBackGuard> | undefined;
beforeEach(() => {
  window.history.replaceState({ __NA: true, tree: "preserved" }, "", "/vocab/42/flashcards");
});
afterEach(() => { guard?.dispose(); vi.restoreAllMocks(); });
const back = () => new Promise<void>((resolve) => {
  window.history.back();
  setTimeout(resolve, 30);
});

it("restores the current page on Back and preserves the router payload", async () => {
  const prompt = vi.fn();
  guard = installStudyBackGuard(prompt);
  await back();
  expect(prompt).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe("/vocab/42/flashcards");
  expect(window.history.state).toMatchObject({ __NA: true, tree: "preserved" });
  await back();
  expect(prompt).toHaveBeenCalledTimes(2);
});

it("removes the extra history step before leaving and does not prompt again", async () => {
  const prompt = vi.fn();
  guard = installStudyBackGuard(prompt);
  await back();
  const navigate = vi.fn();
  guard.leave(navigate);
  guard.leave(navigate);
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(prompt).toHaveBeenCalledOnce();
  expect(window.history.state.englishgoStudyGuard).toBeUndefined();
});

it("does not add a second sentinel when effects remount in Strict Mode", async () => {
  guard = installStudyBackGuard(vi.fn());
  const length = window.history.length;
  guard.dispose();
  const prompt = vi.fn();
  guard = installStudyBackGuard(prompt);
  expect(window.history.length).toBe(length);
  await back();
  expect(prompt).toHaveBeenCalledOnce();
});

it("does not intercept traversal on an unrelated route", () => {
  const prompt = vi.fn();
  guard = installStudyBackGuard(prompt);
  window.dispatchEvent(new PopStateEvent("popstate", { state: { __NA: true } }));
  expect(prompt).not.toHaveBeenCalled();
});
