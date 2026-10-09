import { beforeEach, describe, expect, it, vi } from "vitest";
import { practiceDraftKey, readPracticeDraft } from "./practice-draft-storage";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const payload = (ownerUid: string, updatedAtMillis = 200, startedAtMillis = 10) => JSON.stringify({ ownerUid, updatedAtMillis, startedAtMillis, answers: { 1: { selectedOptionId: 65 } } });
describe("exam draft ownership", () => {
  it("does not load another user's draft or claim ownerless legacy data", () => {
    localStorage.setItem(practiceDraftKey("alice", "test"), payload("alice"));
    localStorage.setItem("practice:test", JSON.stringify({ updatedAtMillis: 300, answers: { 1: "A" } }));
    expect(readPracticeDraft("bob", "test", "{}", 10)).toBe("{}");
    expect(localStorage.getItem("practice:test")).not.toBeNull();
  });
  it("migrates only explicitly owned legacy data and ignores a previous exam run", () => {
    localStorage.setItem("practice:test", payload("alice"));
    expect(readPracticeDraft("alice", "test", "{}", 10)).toBe(payload("alice"));
    expect(localStorage.getItem("practice:test")).toBeNull();
    expect(readPracticeDraft("alice", "test", "{}", 20)).toBe("{}");
  });
  it("uses the newest valid server/local payload, including an interrupted pending save", () => {
    localStorage.setItem(practiceDraftKey("alice", "test"), payload("alice", 200));
    expect(readPracticeDraft("alice", "test", payload("alice", 300), 10)).toBe(payload("alice", 300));
    localStorage.setItem("practice-pending:alice:test:10:id", JSON.stringify({ payload: payload("alice", 400) }));
    expect(readPracticeDraft("alice", "test", payload("alice", 300), 10)).toBe(payload("alice", 400));
  });
  it("preserves server answers when storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(readPracticeDraft("alice", "test", payload("alice"), 10)).toBe(payload("alice"));
  });
});
