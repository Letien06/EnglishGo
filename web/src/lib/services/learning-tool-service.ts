import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firestore/db";
import { ApiError } from "../api/response";
import { recordSkillQuestionLeaderboard } from "./leaderboard";
import { recordStudyActivity, type StudyModule } from "./study-activity";
import type { DauToeicDifficultyLevel } from "../../types/dautoeic";
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

export interface LearningToolService {
  applyProgress(
    uid: string | null,
    levels: DauToeicDifficultyLevel[],
  ): Promise<DauToeicDifficultyLevel[]>;
  summarize(
    uid: string,
    part: number | null,
    level: number | null,
  ): Promise<ProgressSummary>;
  loadAnswers(
    uid: string,
    part: number | null,
    level: number | null,
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
  ): Promise<ListeningProgressDoc[]> {
    const snap = await userCol(uid, config.progressCollection)
      .where("part", "==", part)
      .where("level", "==", level)
      .get();
    return snap.docs.map(toProgressDoc);
  }

  async function findProgressByPart(
    uid: string,
    part: number | null,
  ): Promise<ListeningProgressDoc[]> {
    const snap = await userCol(uid, config.progressCollection)
      .where("part", "==", part)
      .get();
    return snap.docs.map(toProgressDoc);
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

  async function deleteProgressByPartAndLevel(
    uid: string,
    part: number,
    level: number,
  ): Promise<void> {
    const snap = await userCol(uid, config.progressCollection)
      .where("part", "==", part)
      .where("level", "==", level)
      .get();
    const batch = adminDb.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
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

  return {
    async applyProgress(uid, levels) {
      if (!uid || levels.length === 0) return levels;
      // Fetch all progress rows for this part in a SINGLE Firestore query,
      // then compute each level's summary in memory. This avoids the previous
      // one-query-per-level fan-out that made the dashboard slow on every
      // navigation. Progress is still always fresh (not cached).
      const part = levels[0]?.part ?? null;
      const allRows = await findProgressByPart(uid, part);
      const rowsByLevel = new Map<number | null, ListeningProgressDoc[]>();
      for (const row of allRows) {
        const key = row.level ?? null;
        const bucket = rowsByLevel.get(key);
        if (bucket) bucket.push(row);
        else rowsByLevel.set(key, [row]);
      }
      return levels.map((level) => {
        const rows = rowsByLevel.get(level.level) ?? [];
        const summary = summarizeRows(rows, level.part, level.level);
        const remaining = Math.max(0, (level.total ?? 0) - summary.done);
        return {
          ...level,
          done: summary.done,
          correct: summary.correct,
          wrong: summary.wrong,
          remaining,
        };
      });
    },

    summarize,

    async loadAnswers(uid, part, level) {
      if (!uid) return {};
      const rows = await findProgressByPartAndLevel(uid, part, level);
      const answers: Record<string, string> = {};
      for (const row of rows) {
        if (row.questionId && row.selectedAnswer) {
          answers[row.questionId] = normalizeAnswer(row.selectedAnswer);
        }
      }
      return answers;
    },

    async recordProgress(uid, request) {
      const isCorrect =
        normalizeAnswer(request.selectedAnswer) ===
        normalizeAnswer(request.correctAnswer);

      if (!uid) return { saved: false, authenticated: false, correct: isCorrect };

      validateProgressRequest(request, config);
      const questionId = request.questionId!.trim();
      const now = Date.now();
      const progressRef = userCol(uid, config.progressCollection).doc(questionId);

      await progressRef.set(
          {
            source: "DAUTOEIC",
            part: request.part,
            level: request.level,
            itemId: request.itemId!.trim(),
            questionId,
            selectedAnswer: cleanAnswer(request.selectedAnswer),
            correctAnswer: cleanAnswer(request.correctAnswer),
            correct: isCorrect,
            modeUsed: normalizeMode(request.modeUsed),
            assistPercent: normalizeAssist(request.assistPercent),
            replayCount: Math.max(0, request.replayCount ?? 0),
            elapsedSeconds: Math.max(0, request.elapsedSeconds ?? 0),
            score: isCorrect ? (request.level ?? 1) * 10 : 0,
            completedAtMillis: now,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      await recordStudyActivity(uid, {
        module: config.module,
        activityType: "answer",
        sourceId: questionId,
        occurredAtMillis: now,
      }).catch(() => undefined);
      if (isCorrect) {
        await recordSkillQuestionLeaderboard({
          uid,
          module: config.module,
          part: request.part!,
          level: request.level!,
          itemId: request.itemId!.trim(),
          questionId,
          correct: isCorrect,
          occurredAtMillis: now,
          elapsedMillis: Math.max(0, request.elapsedSeconds ?? 0) * 1000,
        }).catch(() => undefined);
      }
      return { saved: true, authenticated: true, correct: isCorrect };
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
      await deleteProgressByPartAndLevel(uid, request.part!, request.level!);
      return {
        saved: true,
        authenticated: true,
        favorite: null,
        message: "Đã reset tiến độ level.",
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
  if (req.part == null || req.part < config.minPart || req.part > config.maxPart) {
    throw new ApiError(`Part must be between ${config.minPart} and ${config.maxPart}`);
  }
  if (req.level == null || req.level < 1 || req.level > 5) {
    throw new ApiError("Difficulty level must be between 1 and 5");
  }
}

function toProgressDoc(doc: FirebaseFirestore.DocumentSnapshot): ListeningProgressDoc {
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
