import { describe, expect, it, vi } from "vitest";
import { createAtomicCheckpointWriter, runChunkWorkers } from "../../scripts/lib/drive-upload-workers.mjs";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("bounded Drive upload workers", () => {
  it("runs exactly three concurrent chunks and schedules each unique digest once", async () => {
    const gates = Array.from({ length: 5 }, deferred);
    const started: string[] = [];
    let active = 0;
    let maximum = 0;
    const result = runChunkWorkers(Array.from({ length: 5 }, (_, index) => [`digest-${index}`, String(index)]), async ([digest, text]: [string, string]) => {
      started.push(digest); active++; maximum = Math.max(maximum, active);
      await gates[Number(text)].promise;
      active--;
    });
    expect(started).toEqual(["digest-0", "digest-1", "digest-2"]);
    gates[0].resolve(); gates[1].resolve(); gates[2].resolve();
    await vi.waitFor(() => expect(started).toHaveLength(5));
    gates[3].resolve(); gates[4].resolve();
    await result;
    expect(maximum).toBe(3);
    expect(new Set(started).size).toBe(5);
  });

  it("stops scheduling after failure, drains active workers and never reaches manifest completion", async () => {
    const gates = Array.from({ length: 5 }, deferred);
    const started: string[] = [];
    const completed: string[] = [];
    const publishManifest = vi.fn();
    const running = runChunkWorkers(Array.from({ length: 5 }, (_, index) => [String(index), "chunk"]), async ([digest]: [string, string]) => {
      started.push(digest);
      await gates[Number(digest)].promise;
      completed.push(digest);
    }).then(publishManifest);
    const settled = vi.fn();
    const caught = running.then(settled, (error: Error) => { settled(); return error; });
    gates[1].reject(new Error("Read-back checksum mismatch"));
    await Promise.resolve(); await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(started).toEqual(["0", "1", "2"]);
    gates[0].resolve(); gates[2].resolve();
    expect(await caught).toMatchObject({ message: "Read-back checksum mismatch" });
    expect(completed).toEqual(["0", "2"]);
    expect(started).toHaveLength(3);
    expect(publishManifest).not.toHaveBeenCalled();
  });

  it("rejects duplicate digest jobs before any remote operation", async () => {
    const work = vi.fn();
    await expect(runChunkWorkers([["same", "a"], ["same", "b"]], work)).rejects.toThrow("Duplicate");
    expect(work).not.toHaveBeenCalled();
  });
});

describe("serialized atomic upload checkpoints", () => {
  it("captures mutations at enqueue time and serializes full writes before rename", async () => {
    const gate = deferred();
    const trace: string[] = [];
    const snapshots: unknown[] = [];
    const io = {
      writeFile: vi.fn(async (_file: string, text: string) => {
        trace.push("write"); snapshots.push(JSON.parse(text));
        if (snapshots.length === 1) await gate.promise;
      }),
      rename: vi.fn(async () => { trace.push("rename"); }),
      rm: vi.fn(async () => undefined),
    };
    const save = createAtomicCheckpointWriter("upload-state.json", io);
    const state = { files: { a: { verified: false } }, complete: false };
    const first = save(state);
    state.files.a.verified = true;
    const second = save(state);
    state.complete = true;
    await Promise.resolve();
    expect(io.writeFile).toHaveBeenCalledTimes(1);
    expect(io.rename).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, second]);
    expect(trace).toEqual(["write", "rename", "write", "rename"]);
    expect(snapshots).toEqual([{ files: { a: { verified: false } }, complete: false }, { files: { a: { verified: true } }, complete: false }]);
    expect(io.writeFile.mock.calls[0][0]).toMatch(/^upload-state\.json\..+\.tmp$/);
  });

  it("retains the old checkpoint on failed replacement and fails queued writes closed", async () => {
    const io = {
      writeFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => { throw new Error("Checkpoint replace failed"); }),
      rm: vi.fn(async () => undefined),
    };
    const save = createAtomicCheckpointWriter("upload-state.json", io);
    const results = await Promise.allSettled([save({ complete: false }), save({ complete: true })]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(io.writeFile).toHaveBeenCalledTimes(1);
    expect(io.rename).toHaveBeenCalledTimes(1);
    expect(io.rm).toHaveBeenCalledTimes(1);
  });
});
