import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { ApiError } from "@/lib/api/response";
import type { ProgressRequest, ProgressResponse } from "@/types/listening";
import { invalidateLearnerActivityCaches } from "./learner-cache";
import { prepareSkillQuestionLeaderboardWrite } from "./leaderboard";
import { studyActivityDayRef, writeStudyActivityInTransaction } from "./study-activity";

type SaveRequest = ProgressRequest;
export type LearningProgressData = Record<string, unknown> & {
  part: number; sourceLevel: number; itemId: string; questionId: string;
  correct: boolean; elapsedSeconds: number; completedAtMillis: number;
};

function fingerprint(request: SaveRequest): string {
  // Explicit stable fields prevent key order and absent optional fields from
  // changing a retry's identity. Include client scoring input, not mutable catalog data.
  return createHash("sha256").update(JSON.stringify([
    request.testId ?? null, request.part, request.level,
    request.itemId, request.questionId, request.selectedAnswer, request.correctAnswer,
    request.modeUsed, request.assistPercent, request.replayCount, request.elapsedSeconds,
    request.expectedUid ?? null, request.answeredAtMillis ?? null,
  ])).digest("hex");
}

function replay(snapshot: FirebaseFirestore.DocumentSnapshot, requestFingerprint: string): ProgressResponse | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  if (data.requestFingerprint !== requestFingerprint) {
    throw new ApiError("Progress request ID was reused with different answers", 409);
  }
  return data.response as ProgressResponse;
}

/** All durable answer effects commit together, including the replay receipt. */
export async function saveLearningProgress(input: {
  uid: string;
  module: "reading" | "listening";
  progressCollection: string;
  request: SaveRequest;
  resolveProgress: () => Promise<LearningProgressData>;
  prepareProjection: (tx: FirebaseFirestore.Transaction, progress: LearningProgressData) => Promise<() => void>;
}): Promise<ProgressResponse> {
  const { uid, module, progressCollection, request } = input;
  if (request.requestId != null) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestId)) {
      throw new ApiError("Invalid progress request ID", 400);
    }
    if (!request.expectedUid || request.expectedUid !== uid) throw new ApiError("Learner session changed", 403);
  }
  const userRef = adminDb.collection("users").doc(uid);
  const receiptRef = request.requestId ? userRef.collection(`${progressCollection}Requests`).doc(request.requestId) : null;
  const requestFingerprint = fingerprint(request);
  if (receiptRef) {
    const previous = replay(await receiptRef.get(), requestFingerprint);
    if (previous) {
      invalidateLearnerActivityCaches(uid);
      return previous;
    }
  }
  const progress = await input.resolveProgress();
  const progressRef = userRef.collection(progressCollection).doc(progress.questionId);
  const response: ProgressResponse = {
    saved: true, authenticated: true, correct: progress.correct,
    ...(request.requestId ? { requestId: request.requestId, uid } : {}),
  };
  const result = await adminDb.runTransaction(async (tx) => {
    if (receiptRef) {
      const previous = replay(await tx.get(receiptRef), requestFingerprint);
      if (previous) return previous;
    }
    // Same-browser queue timestamps preserve answer order even if requests
    // arrive out of order. They are not a cross-device clock guarantee.
    let replaceProgress = true;
    if (request.answeredAtMillis != null) {
      const current = (await tx.get(progressRef)).data();
      const currentTime = current?.answeredAtMillis;
      if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
        const currentId = typeof current?.requestId === "string" ? current.requestId : "";
        replaceProgress = request.answeredAtMillis > currentTime
          || (request.answeredAtMillis === currentTime && (request.requestId ?? "") >= currentId);
      }
    }
    const [daySnap, userSnap, writeAward, writeProjection] = await Promise.all([
      tx.get(studyActivityDayRef(uid, progress.completedAtMillis)),
      tx.get(userRef),
      prepareSkillQuestionLeaderboardWrite(tx, {
        uid, module, part: progress.part, level: progress.sourceLevel,
        itemId: progress.itemId, questionId: progress.questionId, correct: progress.correct,
        occurredAtMillis: progress.completedAtMillis, elapsedMillis: progress.elapsedSeconds * 1000,
      }),
      replaceProgress ? input.prepareProjection(tx, progress) : Promise.resolve(() => {}),
    ]);
    // All reads are complete before the first write, as Firestore requires.
    if (replaceProgress) tx.set(progressRef, progress, { merge: true });
    writeStudyActivityInTransaction(tx, uid, {
      module, activityType: "answer", metric: module, quantity: 1,
      sourceId: progress.questionId, durationSeconds: progress.elapsedSeconds,
      occurredAtMillis: progress.completedAtMillis,
    }, daySnap, userSnap.data() ?? {});
    writeAward(userSnap.data() ?? {});
    writeProjection();
    if (receiptRef) tx.set(receiptRef, { requestFingerprint, response, createdAt: FieldValue.serverTimestamp() });
    return response;
  });
  invalidateLearnerActivityCaches(uid);
  return result;
}
