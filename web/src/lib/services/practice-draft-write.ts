import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "../firestore/db";
import { ApiError } from "../api/response";

export type PracticeDraftMutation = { requestId: string; revision: number; runStartedAtMillis: number };

/** Atomically fence old sessions and late retries before touching learner data. */
export async function writeOrderedPracticeDraft<T extends { startedAtMillis: number; payload: string; updatedAtMillis: number; currentQuestionIndex: number }>(
  ref: DocumentReference,
  mutation: PracticeDraftMutation | undefined,
  makeDraft: (startedAtMillis: number) => T,
): Promise<T> {
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const previous = snapshot.data();
    if (mutation && (!snapshot.exists || previous?.startedAtMillis !== mutation.runStartedAtMillis)) {
      throw new ApiError("Phiên làm bài đã thay đổi hoặc đã nộp. Mở lại bài để tiếp tục.", 409);
    }
    const data = makeDraft(Number(previous?.startedAtMillis) || Date.now());
    if (mutation) {
      const fingerprint = createHash("sha256").update(JSON.stringify([data.payload, data.currentQuestionIndex, mutation.revision])).digest("hex");
      if (previous?.lastRequestId === mutation.requestId) {
        if (previous.lastRequestFingerprint !== fingerprint) throw new ApiError("Mã lưu bài đã được dùng cho bản nháp khác.", 409);
        return { ...data, payload: previous.payload, updatedAtMillis: previous.updatedAtMillis, currentQuestionIndex: previous.currentQuestionIndex };
      }
      if (typeof previous?.clientRevision === "number" && (previous.clientRevision > mutation.revision ||
        (previous.clientRevision === mutation.revision && previous.lastRequestId >= mutation.requestId))) {
        throw new ApiError("Có bản nháp mới hơn trên thiết bị khác. Mở lại bài trước khi lưu tiếp.", 409);
      }
      tx.set(ref, { ...data, clientRevision: mutation.revision, lastRequestId: mutation.requestId, lastRequestFingerprint: fingerprint }, { merge: true });
    } else {
      // Existing clients remain compatible, but cannot overwrite ordered drafts.
      if (previous?.clientRevision != null) throw new ApiError("Vui lòng tải lại trang để tiếp tục lưu bản nháp.", 409);
      tx.set(ref, data, { merge: true });
    }
    return data;
  });
}
