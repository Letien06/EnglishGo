import { randomUUID } from "node:crypto";
import { writeFile, rename, rm } from "node:fs/promises";

/** Capture each checkpoint at enqueue time; replace it only after a full write.
 * @param {string} file
 * @param {{writeFile: (file: string, data: string, options: {encoding: "utf8", mode: number}) => Promise<unknown>, rename: (source: string, target: string) => Promise<unknown>, rm: (file: string, options: {force: boolean}) => Promise<unknown>}} io
 */
export function createAtomicCheckpointWriter(file, io = { writeFile, rename, rm }) {
  let pending = Promise.resolve();
  return (value) => {
    const json = JSON.stringify(value, null, 2);
    pending = pending.then(async () => {
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await io.writeFile(temporary, json, { encoding: "utf8", mode: 0o600 });
        await io.rename(temporary, file);
      } catch (error) {
        await io.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    return pending;
  };
}

/** Stop scheduling on first failure, but drain every already-started operation. */
export async function runChunkWorkers(entries, work, concurrency = 3) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("Invalid Drive chunk concurrency.");
  const queue = Array.from(entries);
  if (new Set(queue.map(([digest]) => digest)).size !== queue.length) throw new Error("Duplicate Drive chunk work.");
  let next = 0;
  let failed = false;
  let failure;
  async function worker() {
    while (!failed && next < queue.length) {
      const entry = queue[next++];
      try { await work(entry); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  if (failed) throw failure;
}
