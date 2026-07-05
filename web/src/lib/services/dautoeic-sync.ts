import {
  fetchListeningDifficultyLevelsFromSource,
  fetchListeningDifficultySessionFromSource,
  fetchPartFromSource,
  fetchReadingDifficultyLevelsFromSource,
  fetchReadingDifficultySessionFromSource,
  fetchSetsFromSource,
  fetchTestFromSource,
  fetchListTestsFromSource,
} from "./dautoeic";
import { writeTestIndex } from "./dautoeic-test-index";
import {
  mirrorKey,
  readSyncStatus,
  writeMirrorJson,
  writeMirrorSession,
  writeSyncStatus,
  type SyncStatus,
} from "./dautoeic-mirror";
import {
  writeCanonicalPart,
  writeCanonicalSets,
  writeCanonicalTest,
  writeCanonicalTests,
} from "./dautoeic-canonical";

const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_BUDGET_MS = 45_000;
const LISTENING_PARTS = [1, 2, 3, 4] as const;
const READING_PARTS = [5, 6, 7] as const;
const LEVELS = [1, 2, 3, 4, 5] as const;
const TEST_PARTS = [1, 2, 3, 4, 5, 6, 7] as const;

type SyncTask = {
  id: string;
  run: () => Promise<void>;
};

export interface DauToeicSyncResult {
  started: boolean;
  completed: boolean;
  skipped: boolean;
  reason?: string;
  cursor: number;
  totalTasks: number;
  processed: number;
  errors: SyncStatus["errors"];
  lastFinishedAtMs: number | null;
}

export async function runDauToeicMirrorSync({
  force = false,
  budgetMs = DEFAULT_BUDGET_MS,
}: {
  force?: boolean;
  budgetMs?: number;
} = {}): Promise<DauToeicSyncResult> {
  const now = Date.now();
  const status = await readSyncStatus();
  const running = status?.status === "running";
  const lastFinishedAtMs = status?.lastFinishedAtMs ?? null;
  const due = force || running || !lastFinishedAtMs || now - lastFinishedAtMs >= SYNC_INTERVAL_MS;

  if (!due) {
    return {
      started: false,
      completed: false,
      skipped: true,
      reason: "not_due",
      cursor: status?.cursor ?? 0,
      totalTasks: status?.totalTasks ?? 0,
      processed: 0,
      errors: status?.errors ?? [],
      lastFinishedAtMs,
    };
  }

  const cycleId = running && status?.cycleId ? status.cycleId : `dautoeic-${now}`;
  let cursor = running ? status?.cursor ?? 0 : 0;
  let errors = running ? status?.errors ?? [] : [];

  await writeSyncStatus({
    status: "running",
    cursor,
    lastStartedAtMs: running ? status?.lastStartedAtMs ?? now : now,
    cycleId,
    errors,
  });

  let tasks: SyncTask[];
  try {
    tasks = await buildSyncTasks();
  } catch (error) {
    const message = errorMessage(error);
    const nextErrors = [
      ...errors,
      { taskId: "build-tasks", message, at: new Date().toISOString() },
    ];
    await writeSyncStatus({
      status: "failed",
      cursor,
      totalTasks: status?.totalTasks ?? 0,
      errors: nextErrors,
    });
    return {
      started: true,
      completed: false,
      skipped: false,
      reason: message,
      cursor,
      totalTasks: status?.totalTasks ?? 0,
      processed: 0,
      errors: nextErrors,
      lastFinishedAtMs,
    };
  }

  await writeSyncStatus({ totalTasks: tasks.length });

  const startedAt = Date.now();
  let processed = 0;
  for (; cursor < tasks.length; cursor += 1) {
    if (Date.now() - startedAt >= budgetMs) break;
    const task = tasks[cursor];
    try {
      await task.run();
    } catch (error) {
      errors = [
        ...errors,
        { taskId: task.id, message: errorMessage(error), at: new Date().toISOString() },
      ].slice(-50);
    }
    processed += 1;
    await writeSyncStatus({ status: "running", cursor: cursor + 1, totalTasks: tasks.length, errors });
  }

  const completed = cursor >= tasks.length;
  if (completed) {
    const finishedAt = Date.now();
    await writeSyncStatus({
      status: errors.length > 0 ? "partial" : "success",
      cursor: tasks.length,
      totalTasks: tasks.length,
      lastFinishedAtMs: finishedAt,
      errors,
    });
    return {
      started: true,
      completed: true,
      skipped: false,
      cursor: tasks.length,
      totalTasks: tasks.length,
      processed,
      errors,
      lastFinishedAtMs: finishedAt,
    };
  }

  await writeSyncStatus({ status: "running", cursor, totalTasks: tasks.length, errors });
  return {
    started: true,
    completed: false,
    skipped: false,
    reason: "budget_exhausted",
    cursor,
    totalTasks: tasks.length,
    processed,
    errors,
    lastFinishedAtMs,
  };
}

async function buildSyncTasks(): Promise<SyncTask[]> {
  const tests = await fetchListTestsFromSource(null);
  const tasks: SyncTask[] = [
    {
      id: "sets:all",
      run: async () => {
        const sets = await fetchSetsFromSource();
        await writeMirrorJson(mirrorKey("sets", "all"), "sets", sets);
        await writeCanonicalSets(sets);
      },
    },
    {
      id: "tests:all",
      run: async () => {
        const freshTests = await fetchListTestsFromSource(null);
        await writeMirrorJson(mirrorKey("tests", null), "tests", freshTests);
        await writeTestIndex(freshTests);
        await writeCanonicalTests(freshTests, { markComplete: true });
      },
    },
  ];

  for (const test of tests) {
    tasks.push({
      id: `test:${test.id}`,
      run: async () => {
        const payload = await fetchTestFromSource(test.id);
        await writeMirrorJson(mirrorKey("test", test.id), "test", payload);
        await writeCanonicalTest(payload);
      },
    });
    for (const part of TEST_PARTS) {
      tasks.push({
        id: `test-part:${test.id}:${part}`,
        run: async () => {
          const payload = await fetchPartFromSource(test.id, part);
          await writeMirrorJson(mirrorKey("test-part", test.id, part), "test-part", payload);
          await writeCanonicalPart(payload);
        },
      });
    }
  }

  for (const part of LISTENING_PARTS) {
    tasks.push({
      id: `listening-levels:${part}`,
      run: async () => {
        const payload = await fetchListeningDifficultyLevelsFromSource(part);
        await writeMirrorJson(mirrorKey("listening", "levels", part), "difficulty-levels", payload);
      },
    });
    for (const level of LEVELS) {
      tasks.push({
        id: `listening-session:${part}:${level}`,
        run: async () => {
          const payload = await fetchListeningDifficultySessionFromSource(part, level, null);
          await writeMirrorSession(mirrorKey("listening", "session", part, level, null), payload);
        },
      });
    }
  }

  for (const part of READING_PARTS) {
    tasks.push({
      id: `reading-levels:${part}`,
      run: async () => {
        const payload = await fetchReadingDifficultyLevelsFromSource(part);
        await writeMirrorJson(mirrorKey("reading", "levels", part), "difficulty-levels", payload);
      },
    });
    for (const level of LEVELS) {
      tasks.push({
        id: `reading-session:${part}:${level}`,
        run: async () => {
          const payload = await fetchReadingDifficultySessionFromSource(part, level, null);
          await writeMirrorSession(mirrorKey("reading", "session", part, level, null), payload);
        },
      });
    }
  }

  return tasks;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
