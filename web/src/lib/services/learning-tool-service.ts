import { FieldValue } from "firebase-admin/firestore";
import { revalidateTag } from "next/cache";
import { adminDb } from "../firestore/db";
import { readServerCache } from "../server-cache";
import { ApiError } from "../api/response";
import { type StudyModule } from "./study-activity";
import { saveLearningProgress } from "./learning-progress-save";
import { prepareLearningProgressProjection } from "./learning-progress-projection";
import { getDifficultySession, getReadingDifficultySession, listDifficultyLevels, listReadingDifficultyLevels } from "./dautoeic";
import { DAUTOEIC_LEVEL_COUNT } from "./dautoeic-source";
import { createHash } from "node:crypto";
import { logInfo } from "../logging";
import { prepareLearningProgressProjectionReset, readLearningProgressProjection } from "./learning-progress-projection";
import { getTestPartSession, type TestPartCatalogEntry } from "./test-part-practice";
import type { DauToeicDifficultyLevel, DauToeicPartTest } from "../../types/dautoeic";
import type {
  ListeningProgressDoc,
  ProgressRequest,
  ProgressResponse,
  ProgressSummary,
  ToolRequest,
  ToolResponse,
} from "../../types/listening";

interface ToolServiceConfig {
  module: Extract<StudyModule, "listening" | "reading">;
  minPart: number;
  maxPart: number;
  progressCollection: string;
  notesCollection: string;
  favoritesCollection: string;
  vocabBasketCollection: string;
}

const PROGRESS_CACHE_SECONDS = 60;

export interface LearningToolService {
  applyTestProgress(uid: string | null, entries: TestPartCatalogEntry[]): Promise<DauToeicPartTest[]>;
  applyProgress(
    uid: string | null,
    levels: DauToeicDifficultyLevel[],
  ): Promise<DauToeicDifficultyLevel[]>;
  applyProgressBatch(
    uid: string | null,
    groups: Array<{ part: number; levels: DauToeicDifficultyLevel[] }>,
  ): Promise<Array<{ part: number; levels: DauToeicDifficultyLevel[] }>>;
  summarize(
    uid: string,
    part: number | null,
    level: number | null,
  ): Promise<ProgressSummary>;
  loadAnswers(
    uid: string,
    part: number | null,
    level: number | null,
    testId?: string | null,
  ): Promise<Record<string, string>>;
  recordProgress(
    uid: string | null,
    request: ProgressRequest,
  ): Promise<ProgressResponse>;
  saveNote(uid: string | null, request: ToolRequest): Promise<ToolResponse>;
  toggleFavorite(
    uid: string | null,
    request: ToolRequest,
  ): Promise<ToolResponse>;
  addVocab(uid: string | null, request: ToolRequest): Promise<ToolResponse>;
  resetLevel(uid: string | null, request: ToolRequest): Promise<ToolResponse>;
}

export function createLearningToolService(
  config: ToolServiceConfig,
): LearningToolService {
  function userCol(uid: string, sub: string) {
    return adminDb.collection("users").doc(uid).collection(sub);
  }

  async function findProgressByPartAndLevel(
    uid: string,
    part: number | null,
    level: number | null,
    testId?: string | null,
  ): Promise<ListeningProgressDoc[]> {
    if (part != null && testId) {
      const session = await getTestPartSession(testId, part);
      const questionIds = new Set(session.items.flatMap((item) => item.questions.map((question) => question.id)));
      const rows = await targetedProgressRows(uid, part, "questionId", [...questionIds]);
      return rows.filter((row) => row.part === part && row.questionId && questionIds.has(row.questionId));
    }
    if (part == null || level == null) return [];
    const itemIds = await currentLevelItemIds(part, level);
    const rows = await targetedProgressRows(uid, part, "itemId", [...itemIds]);
    return rows.filter((row) => row.part === part && row.itemId && itemIds.has(row.itemId));
  }

  async function targetedProgressRows(uid: string, part: number, field: "questionId" | "itemId", ids: string[]) {
    const uniqueIds = [...new Set(ids)].sort();
    if (!uniqueIds.length) return [];
    const fingerprint = createHash("sha256").update(JSON.stringify(uniqueIds)).digest("hex");
    return readServerCache(async () => {
      const startedAt = Date.now();
      let documentReads = 0;
      const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      // Single-field IN queries need no new composite index. Four concurrent chunks bound load.
      for (let offset = 0; offset < uniqueIds.length; offset += 120) {
        const snapshots = await Promise.all(Array.from({ length: Math.min(4, Math.ceil((uniqueIds.length - offset) / 30)) }, (_, index) =>
          userCol(uid, config.progressCollection).where(field, "in", uniqueIds.slice(offset + index * 30, offset + (index + 1) * 30)).get(),
        ));
        docs.push(...snapshots.flatMap((snapshot) => snapshot.docs));
        documentReads += snapshots.reduce((total, snapshot) => total + Math.max(1, snapshot.docs.length), 0);
      }
      if (process.env.NODE_ENV === "production") logInfo("learning_progress_read", { module: config.module, part, strategy: "selection", selectionCount: uniqueIds.length, returnedCount: docs.length, documentReads, durationMs: Date.now() - startedAt });
      return docs.map(toProgressDoc);
    }, ["learning-progress-selection-v1", config.module, uid, String(part), field, fingerprint], {
      revalidate: PROGRESS_CACHE_SECONDS, tags: [progressCacheTag(uid, part)],
    });
  }

  async function currentLevelItemIds(part: number, level: number): Promise<Set<string>> {
    const levels = config.module === "listening"
      ? await listDifficultyLevels(part)
      : await listReadingDifficultyLevels(part);
    return new Set(levels.find((entry) => entry.level === level)?.itemIds ?? []);
  }

  async function scoringLevelFor(request: ProgressRequest): Promise<number> {
    const part = request.part!;
    const level = request.level!;
    const levels = config.module === "listening"
      ? await listDifficultyLevels(part)
      : await listReadingDifficultyLevels(part);
    if (levels.find((entry) => entry.level === level)?.grouping !== "balanced") return level;
    const session = config.module === "listening"
      ? await getDifficultySession(part, level, null)
      : await getReadingDifficultySession(part, level, null);
    const item = session.items.find((entry) => entry.id === request.itemId?.trim() && entry.questions.some((question) => question.id === request.questionId?.trim()));
    if (!item) throw new ApiError("Question does not belong to this practice group.", 400);
    if (item.sourceLevel == null || !Number.isInteger(item.sourceLevel) || item.sourceLevel < 1 || item.sourceLevel > DAUTOEIC_LEVEL_COUNT) {
      throw new ApiError("Practice group is missing its original scoring level.", 503);
    }
    return item.sourceLevel;
  }

  async function findProgressByParts(
    uid: string,
    parts: number[],
  ): Promise<ListeningProgressDoc[]> {
    if (parts.length === 0) return [];
    const projected = await Promise.all(parts.map((part) => readLearningProgressProjection(uid, config.progressCollection, part)));
    return projected.flat().map((data) => toProgressDoc({ data: () => data }));
  }

  function summarizeRows(
    rows: ListeningProgressDoc[],
    part: number | null,
    level: number | null,
  ): ProgressSummary {
    const correct = rows.filter((row) => row.correct).length;
    const wrong = rows.length - correct;
    const distinctItems = new Set(
      rows.map((row) => row.itemId).filter(Boolean),
    ).size;
    return { part, level, done: distinctItems, correct, wrong };
  }

  function applyRowsToLevels(
    levels: DauToeicDifficultyLevel[],
    rows: ListeningProgressDoc[],
  ): DauToeicDifficultyLevel[] {
    const rowsByItem = new Map<string, ListeningProgressDoc[]>();
    for (const row of rows) {
      if (!row.itemId) continue;
      const bucket = rowsByItem.get(row.itemId);
      if (bucket) bucket.push(row);
      else rowsByItem.set(row.itemId, [row]);
    }
    return levels.map((level) => {
      const levelRows = [...new Set(level.itemIds ?? [])].flatMap((itemId) => rowsByItem.get(itemId) ?? []);
      const summary = summarizeRows(levelRows, level.part, level.level);
      return {
        ...level,
        done: summary.done,
        correct: summary.correct,
        wrong: summary.wrong,
        remaining: Math.max(0, (level.total ?? 0) - summary.done),
      };
    });
  }

  function invalidateProgressCache(uid: string, part?: number | null): void {
    const parts = part == null
      ? Array.from({ length: config.maxPart - config.minPart + 1 }, (_, index) => config.minPart + index)
      : [part];
    for (const targetPart of parts) {
      revalidateTag(progressCacheTag(uid, targetPart), { expire: 0 });
    }
  }

  function progressCacheTag(uid: string, part: number): string {
    return `learning-progress:${config.module}:${uid}:${part}`;
  }

  async function cachedProgressRows(uid: string, parts: number[]): Promise<ListeningProgressDoc[]> {
    const safeParts = [...new Set(parts)].sort((left, right) => left - right);
    return readServerCache(
      () => findProgressByParts(uid, safeParts),
      ["learning-progress-catalog-query-v2", config.module, uid, safeParts.join(",")],
      {
        revalidate: PROGRESS_CACHE_SECONDS,
        tags: safeParts.map((part) => progressCacheTag(uid, part)),
      },
    );
  }

  async function deleteProgressByPartAndLevel(
    uid: string,
    part: number,
    level: number,
    testId?: string | null,
  ): Promise<void> {
    const itemIds = testId
      ? new Set((await getTestPartSession(testId, part)).items.flatMap((item) => item.questions.map((question) => question.id)))
      : await currentLevelItemIds(part, level);
    if (itemIds.size === 0) return;
    const field = testId ? "questionId" : "itemId";
    const ids = [...itemIds];
    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let offset = 0; offset < ids.length; offset += 30) {
      const snapshot = await userCol(uid, config.progressCollection).where(field, "in", ids.slice(offset, offset + 30)).get();
      docs.push(...snapshot.docs);
    }
    const matchingDocs = docs.filter((doc) => {
      const row = toProgressDoc(doc);
      const itemId = testId ? row.questionId : row.itemId;
      return row.part === part && itemId && itemIds.has(itemId);
    });
    for (let offset = 0; offset < matchingDocs.length; offset += 200) {
      const selected = matchingDocs.slice(offset, offset + 200);
      await adminDb.runTransaction(async (tx) => {
        const resetProjection = await prepareLearningProgressProjectionReset(tx, uid, config.progressCollection, part, selected.flatMap((doc) => {
          const row = toProgressDoc(doc);
          return row.questionId ? [row.questionId] : [];
        }));
        for (const doc of selected) tx.delete(doc.ref);
        resetProjection();
      });
    }
  }

  async function summarize(
    uid: string,
    part: number | null,
    level: number | null,
  ): Promise<ProgressSummary> {
    if (!uid) return { part, level, done: 0, correct: 0, wrong: 0 };
    const rows = await findProgressByPartAndLevel(uid, part, level);
    return summarizeRows(rows, part, level);
  }

  async function applyProgressBatch(
    uid: string | null,
    groups: Array<{ part: number; levels: DauToeicDifficultyLevel[] }>,
  ): Promise<Array<{ part: number; levels: DauToeicDifficultyLevel[] }>> {
    if (!uid || groups.length === 0) return groups;
    const parts = [...new Set(groups.map((group) => group.part))];
    const allRows = await cachedProgressRows(uid, parts);
    const rowsByPart = new Map<number, ListeningProgressDoc[]>();
    for (const row of allRows) {
      if (row.part == null) continue;
      const bucket = rowsByPart.get(row.part);
      if (bucket) bucket.push(row);
      else rowsByPart.set(row.part, [row]);
    }
    const enrichedGroups = groups.map((group) => ({
      part: group.part,
      levels: applyRowsToLevels(group.levels, rowsByPart.get(group.part) ?? []),
    }));
    return enrichedGroups;
  }

  return {
    async applyTestProgress(uid, entries) {
      if (!uid || entries.length === 0) return entries.map((entry) => entry.test);
      const rows = await cachedProgressRows(uid, [...new Set(entries.map((entry) => entry.test.part))]);
      const byQuestion = new Map(rows.filter((row) => row.questionId && row.selectedAnswer).map((row) => [`${row.part}:${row.questionId}`, row]));
      return entries.map(({ test, items }) => {
        const answers = [...new Set(items.flatMap((item) => item.questionIds))].flatMap((questionId) => {
          const row = byQuestion.get(`${test.part}:${questionId}`);
          return row ? [row] : [];
        });
        const nextIndex = items.findIndex((item) => item.questionIds.some((questionId) => !byQuestion.has(`${test.part}:${questionId}`)));
        const correct = answers.filter((row) => row.correct).length;
        return { ...test, done: answers.length, correct, wrong: answers.length - correct, nextIndex: Math.max(0, nextIndex) };
      });
    },

    async applyProgress(uid, levels) {
      if (!uid || levels.length === 0) return levels;
      const part = levels[0]?.part ?? null;
      if (part == null) return levels;
      const groups = await applyProgressBatch(uid, [{ part, levels }]);
      return groups[0]?.levels ?? levels;
    },

    applyProgressBatch,

    summarize,

    async loadAnswers(uid, part, level, testId) {
      if (!uid) return {};
      const rows = await findProgressByPartAndLevel(uid, part, level, testId);
      const answers: Record<string, string> = {};
      for (const row of rows) {
        if (row.questionId && row.selectedAnswer) {
          answers[row.questionId] = normalizeAnswer(row.selectedAnswer);
        }
      }
      return answers;
    },

    async recordProgress(uid, request) {
      let isCorrect =
        normalizeAnswer(request.selectedAnswer) ===
        normalizeAnswer(request.correctAnswer);

      if (!uid) return { saved: false, authenticated: false, correct: isCorrect };

      const result = await saveLearningProgress({
        uid, module: config.module, progressCollection: config.progressCollection, request,
        prepareProjection: (tx, progress) => prepareLearningProgressProjection(tx, uid, config.progressCollection, progress),
        resolveProgress: async () => {
          validateProgressRequest(request, config);
          let scoringLevel: number;
          let correctAnswer = request.correctAnswer;
          if (request.testId) {
            const session = await getTestPartSession(request.testId, request.part!);
            const item = session.items.find((entry) => entry.id === request.itemId?.trim());
            const question = item?.questions.find((entry) => entry.id === request.questionId?.trim());
            if (!item || !question) throw new ApiError("Question does not belong to this test part.", 400);
            correctAnswer = question.correctAnswer;
            if (!/^[A-D]$/.test(normalizeAnswer(correctAnswer)) || !/^[A-D]$/.test(normalizeAnswer(request.selectedAnswer))) throw new ApiError("Invalid answer.", 400);
            isCorrect = normalizeAnswer(request.selectedAnswer) === normalizeAnswer(correctAnswer);
            const levels = config.module === "listening" ? await listDifficultyLevels(request.part!) : await listReadingDifficultyLevels(request.part!);
            const original = levels.find((entry) => entry.itemIds.includes(item.id));
            scoringLevel = original
              ? await scoringLevelFor({ ...request, level: original.level })
              : item.sourceLevel ?? 1;
          } else {
            scoringLevel = await scoringLevelFor(request);
          }
          const questionId = request.questionId!.trim();
          const now = Date.now();
          return {
            source: "DAUTOEIC",
            part: request.part!,
            level: request.testId ? scoringLevel : request.level,
            testId: request.testId ?? null,
            sourceLevel: scoringLevel,
            itemId: request.itemId!.trim(),
            questionId,
            selectedAnswer: cleanAnswer(request.selectedAnswer),
            correctAnswer: cleanAnswer(correctAnswer),
            correct: isCorrect,
            modeUsed: normalizeMode(request.modeUsed),
            assistPercent: normalizeAssist(request.assistPercent),
            replayCount: Math.max(0, request.replayCount ?? 0),
            elapsedSeconds: Math.max(0, request.elapsedSeconds ?? 0),
            score: isCorrect ? scoringLevel * 10 : 0,
            completedAtMillis: now,
            requestId: request.requestId ?? FieldValue.delete(),
            answeredAtMillis: request.answeredAtMillis ?? FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          };
        },
      });
      invalidateProgressCache(uid, request.part);
      return result;
    },

    async saveNote(uid, request) {
      if (!uid) {
        return unauthenticatedToolResponse("Đăng nhập để lưu ghi chú.");
      }
      requireItemId(request);
      if (!request.note?.trim()) throw new ApiError("Note is required");

      const itemId = request.itemId!.trim();
      const now = Date.now();
      const docRef = userCol(uid, config.notesCollection).doc(itemId);
      const snap = await docRef.get();
      const data: Record<string, unknown> = {
        itemId,
        questionId: clean(request.questionId),
        note: request.note.trim(),
        updatedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!snap.exists) {
        data.createdAtMillis = now;
        data.createdAt = FieldValue.serverTimestamp();
      }
      await docRef.set(data, { merge: true });
      return {
        saved: true,
        authenticated: true,
        favorite: null,
        message: "Đã lưu ghi chú.",
      };
    },

    async toggleFavorite(uid, request) {
      if (!uid) {
        return unauthenticatedToolResponse("Đăng nhập để lưu yêu thích.");
      }
      requireItemId(request);
      requirePartLevel(request, config);

      const itemId = request.itemId!.trim();
      const docRef = userCol(uid, config.favoritesCollection).doc(itemId);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.delete();
        return {
          saved: true,
          authenticated: true,
          favorite: false,
          message: "Đã bỏ yêu thích.",
        };
      }

      await docRef.set(
        {
          itemId,
          questionId: clean(request.questionId),
          part: request.part,
          level: request.level,
          createdAtMillis: Date.now(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return {
        saved: true,
        authenticated: true,
        favorite: true,
        message: "Đã lưu yêu thích.",
      };
    },

    async addVocab(uid, request) {
      if (!uid) {
        return unauthenticatedToolResponse("Đăng nhập để lưu từ vựng.");
      }
      requireItemId(request);
      if (!request.word?.trim()) throw new ApiError("Word is required");

      await userCol(uid, config.vocabBasketCollection).add({
        itemId: request.itemId!.trim(),
        questionId: clean(request.questionId),
        word: request.word.trim(),
        normalizedWord: request.word.trim().toLowerCase(),
        meaning: clean(request.meaning),
        example: clean(request.example),
        createdAtMillis: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        saved: true,
        authenticated: true,
        favorite: null,
        message: "Đã thêm vào giỏ từ.",
      };
    },

    async resetLevel(uid, request) {
      if (!uid) {
        return unauthenticatedToolResponse("Đăng nhập để reset tiến độ.");
      }
      requirePartLevel(request, config);
      await deleteProgressByPartAndLevel(uid, request.part!, request.level!, request.testId);
      invalidateProgressCache(uid, request.part);
      return {
        saved: true,
        authenticated: true,
        favorite: null,
        message: request.testId ? "Đã xóa tiến độ Part này trong test." : "Đã reset tiến độ level.",
      };
    },
  };
}

function validateProgressRequest(
  req: ProgressRequest,
  config: ToolServiceConfig,
): void {
  requirePartLevel(req, config);
  if (!req.itemId?.trim() || !req.questionId?.trim()) {
    throw new ApiError("Item and question are required");
  }
}

function requireItemId(req: ToolRequest): void {
  if (!req.itemId?.trim()) throw new ApiError("Item is required");
}

function requirePartLevel(
  req: Pick<ProgressRequest, "part" | "level">,
  config: ToolServiceConfig,
): void {
  if (req.part == null || !Number.isInteger(req.part) || req.part < config.minPart || req.part > config.maxPart) {
    throw new ApiError(`Part must be between ${config.minPart} and ${config.maxPart}`);
  }
  if (req.level == null || !Number.isInteger(req.level) || req.level < 1 || req.level > DAUTOEIC_LEVEL_COUNT) {
    throw new ApiError(`Difficulty level must be between 1 and ${DAUTOEIC_LEVEL_COUNT}`);
  }
}

function toProgressDoc(doc: Pick<FirebaseFirestore.DocumentSnapshot, "data">): ListeningProgressDoc {
  const data = doc.data() ?? {};
  return {
    source: str(data, "source"),
    part: num(data, "part"),
    level: num(data, "level"),
    itemId: str(data, "itemId"),
    questionId: str(data, "questionId"),
    selectedAnswer: str(data, "selectedAnswer"),
    correctAnswer: str(data, "correctAnswer"),
    correct: data.correct === true,
    modeUsed: str(data, "modeUsed"),
    assistPercent: num(data, "assistPercent"),
    replayCount: num(data, "replayCount"),
    elapsedSeconds: num(data, "elapsedSeconds"),
    score: num(data, "score"),
    completedAtMillis: num(data, "completedAtMillis"),
  };
}

function unauthenticatedToolResponse(message: string): ToolResponse {
  return { saved: false, authenticated: false, favorite: null, message };
}

function normalizeAnswer(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function cleanAnswer(value: string | null | undefined): string | null {
  return value?.trim().toUpperCase() ?? null;
}

function normalizeMode(mode: string | null | undefined): string {
  switch (mode) {
    case "bilingual":
    case "fill":
    case "flip":
      return mode;
    default:
      return "normal";
  }
}

function normalizeAssist(assist: number | null | undefined): number {
  switch (assist) {
    case 30:
    case 50:
    case 100:
      return assist;
    default:
      return 30;
  }
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function str(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function num(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === "number" ? value : null;
}
