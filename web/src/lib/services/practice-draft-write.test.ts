import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentReference } from "firebase-admin/firestore";
const state = vi.hoisted(() => ({ doc: undefined as Record<string, unknown> | undefined, writes: 0 }));
vi.mock("../firestore/db", () => ({ adminDb: { runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
  get: async () => ({ exists: Boolean(state.doc), data: () => state.doc }),
  set: (_ref: unknown, data: Record<string, unknown>) => { state.doc = { ...state.doc, ...data }; state.writes++; },
}) } }));
import { writeOrderedPracticeDraft } from "./practice-draft-write";
const ref = {} as DocumentReference;
const mutation = { requestId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", revision: 100, runStartedAtMillis: 10 };
const makeDraft = (startedAtMillis: number) => ({ payload: '{"answers":{"1":"A"}}', startedAtMillis, updatedAtMillis: 200, currentQuestionIndex: 0 });
beforeEach(() => { state.doc = { startedAtMillis: 10 }; state.writes = 0; });
describe("ordered exam writes", () => {
  it("replays a successful mutation without another write and rejects ID reuse", async () => {
    const first = await writeOrderedPracticeDraft(ref, mutation, makeDraft);
    expect(await writeOrderedPracticeDraft(ref, mutation, makeDraft)).toEqual(first);
    expect(state.writes).toBe(1);
    await expect(writeOrderedPracticeDraft(ref, mutation, start => ({ ...makeDraft(start), payload: "changed" }))).rejects.toMatchObject({ status: 409 });
  });
  it("rejects older requests that arrive after a newer revision", async () => {
    await writeOrderedPracticeDraft(ref, { ...mutation, revision: 200 }, makeDraft);
    await expect(writeOrderedPracticeDraft(ref, { ...mutation, requestId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" }, makeDraft)).rejects.toMatchObject({ status: 409 });
    expect(state.writes).toBe(1);
  });
  it("cannot resurrect a submitted draft or overwrite a restarted exam", async () => {
    state.doc = undefined;
    await expect(writeOrderedPracticeDraft(ref, mutation, makeDraft)).rejects.toMatchObject({ status: 409 });
    state.doc = { startedAtMillis: 20 };
    await expect(writeOrderedPracticeDraft(ref, mutation, makeDraft)).rejects.toMatchObject({ status: 409 });
    expect(state.writes).toBe(0);
  });
});
