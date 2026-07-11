import { FieldValue } from "firebase-admin/firestore";
import { ApiError, NotFound } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { mergeTranscriptCues, parseTranscript } from "@/lib/parsers/transcript";
import { buildPrompt, gradeDictationAttempt, type MaskPercent } from "@/lib/services/dictation-grading";
import type {
  DictationAttemptRequest,
  DictationAttemptResult,
  DictationLesson,
  DictationProgressSummary,
  DictationSegment,
  DictationSegmentProgress,
  DictationSourceType,
} from "@/types/dictation";

const LESSONS = COLLECTIONS.dictationLessons;
const LEVELS = new Set(["A2", "B1", "B2", "C1"]);
const MASKS = new Set([30, 50, 100]);

export interface DictationCatalogFilters {
  level?: string | null;
  topic?: string | null;
  source?: string | null;
  duration?: string | null;
}

export interface DictationLessonCard {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  level: string;
  topics: string[];
  segmentCount: number;
  publicAttribution: string;
  publishedAtMillis: number | null;
}

export interface DictationLessonView extends DictationLessonCard {
  youtubeVideoId: string;
  embedUrl: string;
  accent: string | null;
  descriptionVi: string | null;
  segments: Array<Pick<DictationSegment, "id" | "index" | "startSeconds" | "endSeconds" | "leadInSeconds" | "tailSeconds" | "speaker" | "wordCount">>;
}

export interface DictationAdminInput {
  title: string;
  slug: string;
  sourceName: string;
  sourceType: DictationSourceType;
  sourceUrl: string;
  youtubeVideoId: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  level: string;
  topics: string[];
  publicAttribution: string;
  transcriptOrigin: string;
  descriptionVi: string | null;
  licenseStatus: "PENDING" | "VERIFIED" | "EXPIRED";
  rightsEvidenceNote: string;
}

export async function listPublishedLessons(filters: DictationCatalogFilters = {}): Promise<DictationLessonCard[]> {
  const snap = await adminDb.collection(LESSONS).where("status", "==", "PUBLISHED").get();
  return snap.docs
    .map((doc) => toLesson(doc.id, doc.data()))
    .filter((lesson): lesson is DictationLesson => lesson !== null)
    .filter((lesson) => matchesFilters(lesson, filters))
    .sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title))
    .map(toCard);
}

export async function getPublishedLessonView(lessonId: string): Promise<DictationLessonView> {
  const lesson = await getLesson(lessonId);
  if (lesson.status !== "PUBLISHED") throw NotFound("Bai nghe khong ton tai.");
  const segments = await getSegments(lessonId, true);
  return {
    ...toCard(lesson),
    youtubeVideoId: lesson.youtubeVideoId,
    embedUrl: lesson.embedUrl,
    accent: lesson.accent,
    descriptionVi: lesson.descriptionVi,
    segments: segments.map(({ id, index, startSeconds, endSeconds, leadInSeconds, tailSeconds, speaker, wordCount }) => ({ id, index, startSeconds, endSeconds, leadInSeconds, tailSeconds, speaker, wordCount })),
  };
}

export async function getPrompt(lessonId: string, segmentId: string, maskPercent: number) {
  const mask = validateMask(maskPercent);
  await requirePublishedLesson(lessonId);
  const segment = await getSegment(lessonId, segmentId);
  return buildPrompt(segment.id, segment.expectedText, mask);
}

export async function submitAttempt(
  uid: string | null,
  lessonId: string,
  segmentId: string,
  request: DictationAttemptRequest,
): Promise<DictationAttemptResult> {
  const mask = validateMask(request.maskPercent);
  const lesson = await requirePublishedLesson(lessonId);
  const segment = await getSegment(lessonId, segmentId);
  const result = gradeDictationAttempt({
    segmentId,
    expectedText: segment.expectedText,
    acceptedNormalizedAnswers: segment.acceptedNormalizedAnswers,
    maskPercent: mask,
    blankAnswers: request.blankAnswers,
    fullAnswer: request.fullAnswer,
  });
  const passed = result.scorePercent === 100;
  const masteredNow = passed && mask === 100 && Math.max(0, request.hintCount) === 0;

  if (uid) {
    await saveProgress(uid, lesson, segment, request, result.normalizedAnswer, result.scorePercent, passed, masteredNow, mask);
  }

  return {
    saved: Boolean(uid),
    authenticated: Boolean(uid),
    scorePercent: result.scorePercent,
    isCompleted: passed,
    isMastered: masteredNow,
    feedbackTokens: result.feedbackTokens,
    expectedText: segment.expectedText,
    nextRecommendedMaskPercent: passed && mask === 30 ? 50 : passed && mask === 50 ? 100 : mask,
  };
}

export async function getUserLessonProgress(uid: string, lessonId: string): Promise<{ summary: DictationProgressSummary | null; segments: DictationSegmentProgress[] }> {
  const summaryRef = userLessonRef(uid, lessonId);
  const [summarySnap, segmentsSnap] = await Promise.all([summaryRef.get(), summaryRef.collection("segments").get()]);
  return {
    summary: summarySnap.exists ? toSummary(lessonId, summarySnap.data()) : null,
    segments: segmentsSnap.docs.map((doc) => toSegmentProgress(lessonId, doc.id, doc.data())).filter((item): item is DictationSegmentProgress => item !== null),
  };
}

export async function listUserLessonProgress(uid: string): Promise<DictationProgressSummary[]> {
  const snap = await adminDb.collection("users").doc(uid).collection("dictationLessonProgress").get();
  return snap.docs
    .map((doc) => toSummary(doc.id, doc.data()))
    .filter((item): item is DictationProgressSummary => item !== null)
    .sort((a, b) => b.lastStudiedAtMillis - a.lastStudiedAtMillis);
}

export async function listAdminLessons(): Promise<DictationLesson[]> {
  const snap = await adminDb.collection(LESSONS).get();
  return snap.docs.map((doc) => toLesson(doc.id, doc.data())).filter((lesson): lesson is DictationLesson => lesson !== null).sort((a, b) => b.updatedAtMillis - a.updatedAtMillis);
}

export async function getAdminLessonDetail(lessonId: string): Promise<{ lesson: DictationLesson; segments: DictationSegment[] }> {
  const lesson = await getLesson(lessonId);
  return { lesson, segments: await getSegments(lessonId, false) };
}

export async function updateSegment(lessonId: string, segmentId: string, input: { startSeconds: number; endSeconds: number; speaker: string | null; expectedText: string; acceptedNormalizedAnswers: string[] }, uid: string): Promise<DictationSegment> {
  const lesson = await getLesson(lessonId);
  if (lesson.status === "PUBLISHED") throw new ApiError("Archive lesson before editing its segments.");
  const current = await getSegment(lessonId, segmentId);
  if (!Number.isFinite(input.startSeconds) || !Number.isFinite(input.endSeconds) || input.startSeconds < 0 || input.endSeconds <= input.startSeconds || input.endSeconds > lesson.durationSeconds + 2) throw new ApiError("Invalid segment timestamps.");
  const expectedText = input.expectedText.replace(/\s+/g, " ").trim();
  if (!expectedText || expectedText.length > 10_000) throw new ApiError("Invalid segment transcript.");
  const now = Date.now();
  const next = { ...current, startSeconds: input.startSeconds, endSeconds: input.endSeconds, speaker: input.speaker?.trim() || null, expectedText, acceptedNormalizedAnswers: input.acceptedNormalizedAnswers.map((item) => item.trim()).filter(Boolean).slice(0, 10), wordCount: wordCount(expectedText), updatedAtMillis: now };
  await adminDb.collection(LESSONS).doc(lessonId).collection("segments").doc(segmentId).update({ ...next, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
  await audit("UPDATE_SEGMENT", lessonId, uid);
  return next;
}

export async function createDraft(input: DictationAdminInput, uid: string): Promise<DictationLesson> {
  const clean = validateAdminInput(input);
  const ref = adminDb.collection(LESSONS).doc();
  const now = Date.now();
  const lesson: DictationLesson = {
    id: ref.id, status: "DRAFT", orderIndex: now, title: clean.title, slug: clean.slug,
    descriptionVi: clean.descriptionVi, sourceName: clean.sourceName, sourceType: clean.sourceType,
    sourceUrl: clean.sourceUrl, youtubeVideoId: clean.youtubeVideoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${clean.youtubeVideoId}`,
    thumbnailUrl: clean.thumbnailUrl, durationSeconds: clean.durationSeconds, language: "en", accent: null,
    level: clean.level as DictationLesson["level"], topics: clean.topics, segmentCount: 0, wordCount: 0,
    estimatedWpm: null, transcriptOrigin: clean.transcriptOrigin, licenseStatus: clean.licenseStatus,
    publicAttribution: clean.publicAttribution, rightsId: ref.id, publishedAtMillis: null,
    createdAtMillis: now, updatedAtMillis: now,
  };
  const batch = adminDb.batch();
  batch.set(ref, { ...lesson, createdByUid: uid, updatedByUid: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(adminDb.collection(COLLECTIONS.dictationRights).doc(ref.id), {
    lessonId: ref.id, licenseType: clean.sourceType, permissionScope: ["YOUTUBE_EMBED", "TRANSCRIPT_DISPLAY", "DICTATION_EXERCISES"],
    evidenceUrl: null, evidenceNote: clean.rightsEvidenceNote, attributionRequired: true, attributionText: clean.publicAttribution,
    verifiedByUid: clean.licenseStatus === "VERIFIED" ? uid : null, verifiedAtMillis: clean.licenseStatus === "VERIFIED" ? now : null,
    expiresAtMillis: null, reviewStatus: clean.licenseStatus, updatedAtMillis: now, updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await audit("CREATE_DRAFT", ref.id, uid);
  return lesson;
}

export async function importTranscript(lessonId: string, transcript: string, uid: string): Promise<{ segmentCount: number }> {
  const lesson = await getLesson(lessonId);
  if (lesson.status === "PUBLISHED") throw new ApiError("Archive lesson before replacing its transcript.");
  const cues = mergeTranscriptCues(parseTranscript(transcript));
  if (!cues.length) throw new ApiError("Transcript does not contain valid captions.");
  const collection = adminDb.collection(LESSONS).doc(lessonId).collection("segments");
  const previous = await collection.get();
  const batch = adminDb.batch();
  previous.docs.forEach((doc) => batch.delete(doc.ref));
  const now = Date.now();
  cues.forEach((cue, position) => {
    const id = `s${String(position + 1).padStart(3, "0")}`;
    batch.set(collection.doc(id), {
      lessonId, index: position + 1, startSeconds: cue.startSeconds, endSeconds: cue.endSeconds,
      leadInSeconds: 0.4, tailSeconds: 0.3, speaker: null, expectedText: cue.text,
      acceptedNormalizedAnswers: [], translationVi: null, wordCount: wordCount(cue.text),
      status: "DRAFT", createdAtMillis: now, updatedAtMillis: now,
    });
  });
  batch.update(adminDb.collection(LESSONS).doc(lessonId), {
    segmentCount: cues.length, wordCount: cues.reduce((sum, cue) => sum + wordCount(cue.text), 0),
    estimatedWpm: estimateWpm(cues), updatedAtMillis: now, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await audit("IMPORT_TRANSCRIPT", lessonId, uid);
  return { segmentCount: cues.length };
}

export async function publishLesson(lessonId: string, uid: string): Promise<DictationLesson> {
  const lesson = await getLesson(lessonId);
  if (lesson.licenseStatus !== "VERIFIED" || !lesson.publicAttribution.trim()) throw new ApiError("Verify usage rights and attribution before publishing.");
  const rights = await adminDb.collection(COLLECTIONS.dictationRights).doc(lesson.id).get();
  if (!rights.exists || !String(rights.get("evidenceNote") ?? "").trim()) throw new ApiError("Add private permission evidence before publishing.");
  const segments = await getSegments(lessonId, false);
  if (!segments.length) throw new ApiError("Import at least one transcript segment before publishing.");
  const now = Date.now();
  const batch = adminDb.batch();
  batch.update(adminDb.collection(LESSONS).doc(lessonId), { status: "PUBLISHED", publishedAtMillis: now, updatedAtMillis: now, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
  segments.forEach((segment) => batch.update(adminDb.collection(LESSONS).doc(lessonId).collection("segments").doc(segment.id), { status: "PUBLISHED", updatedAtMillis: now }));
  await batch.commit();
  await audit("PUBLISH", lessonId, uid);
  return { ...lesson, status: "PUBLISHED", publishedAtMillis: now, updatedAtMillis: now };
}

export async function archiveLesson(lessonId: string, uid: string): Promise<DictationLesson> {
  const lesson = await getLesson(lessonId);
  const segments = await getSegments(lessonId, false);
  const now = Date.now();
  const batch = adminDb.batch();
  batch.update(adminDb.collection(LESSONS).doc(lessonId), { status: "ARCHIVED", updatedAtMillis: now, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
  segments.forEach((segment) => batch.update(adminDb.collection(LESSONS).doc(lessonId).collection("segments").doc(segment.id), { status: "ARCHIVED", updatedAtMillis: now }));
  await batch.commit();
  await audit("ARCHIVE", lessonId, uid);
  return { ...lesson, status: "ARCHIVED", updatedAtMillis: now };
}

export async function verifyLessonRights(lessonId: string, uid: string): Promise<DictationLesson> {
  const lesson = await getLesson(lessonId);
  const rightsRef = adminDb.collection(COLLECTIONS.dictationRights).doc(lessonId);
  const rights = await rightsRef.get();
  if (!rights.exists || !String(rights.get("evidenceNote") ?? "").trim()) throw new ApiError("Add private permission evidence before verification.");
  const now = Date.now();
  await adminDb.runTransaction(async (tx) => {
    tx.update(adminDb.collection(LESSONS).doc(lessonId), { licenseStatus: "VERIFIED", updatedAtMillis: now, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
    tx.set(rightsRef, { reviewStatus: "VERIFIED", verifiedByUid: uid, verifiedAtMillis: now, updatedAtMillis: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await audit("VERIFY_RIGHTS", lessonId, uid);
  return { ...lesson, licenseStatus: "VERIFIED", updatedAtMillis: now };
}

export async function resetLessonProgress(uid: string, lessonId: string): Promise<void> {
  const ref = userLessonRef(uid, lessonId);
  const segments = await ref.collection("segments").get();
  const batch = adminDb.batch();
  batch.delete(ref);
  segments.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function saveProgress(uid: string, lesson: DictationLesson, segment: DictationSegment, request: DictationAttemptRequest, answer: string, score: number, passed: boolean, masteredNow: boolean, mask: MaskPercent) {
  const summaryRef = userLessonRef(uid, lesson.id);
  const segmentRef = summaryRef.collection("segments").doc(segment.id);
  await adminDb.runTransaction(async (tx) => {
    const [summarySnap, segmentSnap] = await Promise.all([tx.get(summaryRef), tx.get(segmentRef)]);
    const old = segmentSnap.exists ? toSegmentProgress(lesson.id, segment.id, segmentSnap.data()) : null;
    const wasCompleted = Boolean(old?.completedAtMillis);
    const wasMastered = Boolean(old?.masteredAtMillis);
    const isCompleted = wasCompleted || passed;
    const isMastered = wasMastered || masteredNow;
    const now = Date.now();
    const completedDelta = !wasCompleted && isCompleted ? 1 : 0;
    const masteredDelta = !wasMastered && isMastered ? 1 : 0;
    const summary = summarySnap.exists ? toSummary(lesson.id, summarySnap.data()) : null;
    const completedCount = Math.min(lesson.segmentCount, (summary?.completedCount ?? 0) + completedDelta);
    const masteredCount = Math.min(lesson.segmentCount, (summary?.masteredCount ?? 0) + masteredDelta);
    tx.set(segmentRef, {
      lessonId: lesson.id, segmentId: segment.id, segmentIndex: segment.index,
      attemptCount: (old?.attemptCount ?? 0) + 1,
      replayCount: (old?.replayCount ?? 0) + clamp(request.replayCount, 0, 100),
      hintCount: (old?.hintCount ?? 0) + clamp(request.hintCount, 0, 100),
      lastMaskPercent: mask, highestPassedMaskPercent: Math.max(old?.highestPassedMaskPercent ?? 0, passed ? mask : 0),
      lastScorePercent: score, lastAnswer: answer || null,
      completedAtMillis: old?.completedAtMillis ?? (isCompleted ? now : null),
      masteredAtMillis: old?.masteredAtMillis ?? (isMastered ? now : null),
      lastStudiedAtMillis: now, updatedAtMillis: now, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(summaryRef, {
      lessonId: lesson.id, lessonTitleSnapshot: lesson.title, sourceNameSnapshot: lesson.sourceName,
      levelSnapshot: lesson.level, segmentCountSnapshot: lesson.segmentCount, completedCount, masteredCount,
      lastSegmentIndex: segment.index, lastMaskPercent: mask, startedAtMillis: summary?.startedAtMillis ?? now,
      lastStudiedAtMillis: now, completedAtMillis: completedCount === lesson.segmentCount ? now : null,
      updatedAtMillis: now, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function requirePublishedLesson(lessonId: string) { const lesson = await getLesson(lessonId); if (lesson.status !== "PUBLISHED") throw NotFound("Bai nghe khong ton tai."); return lesson; }
async function getLesson(lessonId: string): Promise<DictationLesson> { const snap = await adminDb.collection(LESSONS).doc(lessonId).get(); const lesson = snap.exists ? toLesson(snap.id, snap.data()) : null; if (!lesson) throw NotFound("Bai nghe khong ton tai."); return lesson; }
async function getSegment(lessonId: string, segmentId: string): Promise<DictationSegment> { const snap = await adminDb.collection(LESSONS).doc(lessonId).collection("segments").doc(segmentId).get(); const segment = snap.exists ? toSegment(snap.id, snap.data()) : null; if (!segment) throw NotFound("Doan nghe khong ton tai."); return segment; }
async function getSegments(lessonId: string, publishedOnly: boolean): Promise<DictationSegment[]> { const snap = await adminDb.collection(LESSONS).doc(lessonId).collection("segments").get(); return snap.docs.map((doc) => toSegment(doc.id, doc.data())).filter((segment): segment is DictationSegment => segment !== null).filter((segment) => !publishedOnly || segment.status === "PUBLISHED").sort((a, b) => a.index - b.index); }
function userLessonRef(uid: string, lessonId: string) { return adminDb.collection("users").doc(uid).collection("dictationLessonProgress").doc(lessonId); }
function toCard(lesson: DictationLesson): DictationLessonCard { const { id, title, sourceName, sourceUrl, thumbnailUrl, durationSeconds, level, topics, segmentCount, publicAttribution, publishedAtMillis } = lesson; return { id, title, sourceName, sourceUrl, thumbnailUrl, durationSeconds, level, topics, segmentCount, publicAttribution, publishedAtMillis }; }
function matchesFilters(lesson: DictationLesson, filters: DictationCatalogFilters) { return (!filters.level || lesson.level === filters.level) && (!filters.topic || lesson.topics.includes(filters.topic)) && (!filters.source || lesson.sourceName === filters.source) && (!filters.duration || durationMatches(lesson.durationSeconds, filters.duration)); }
function durationMatches(seconds: number, value: string) { return value === "SHORT" ? seconds < 300 : value === "MEDIUM" ? seconds >= 300 && seconds <= 600 : value === "LONG" ? seconds > 600 : true; }
function validateMask(value: number): MaskPercent { if (!MASKS.has(value)) throw new ApiError("Mask percent must be 30, 50, or 100."); return value as MaskPercent; }
function validateAdminInput(input: DictationAdminInput): DictationAdminInput { if (!input.title.trim() || !input.slug.trim() || !input.sourceName.trim() || !input.sourceUrl.trim() || !input.youtubeVideoId.trim() || !input.publicAttribution.trim() || !input.rightsEvidenceNote.trim()) throw new ApiError("Missing required lesson fields."); if (!LEVELS.has(input.level)) throw new ApiError("Level must be A2, B1, B2, or C1."); if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new ApiError("Duration must be positive."); return { ...input, title: input.title.trim(), slug: input.slug.trim(), sourceName: input.sourceName.trim(), sourceUrl: input.sourceUrl.trim(), youtubeVideoId: input.youtubeVideoId.trim(), topics: input.topics.filter(Boolean), publicAttribution: input.publicAttribution.trim(), transcriptOrigin: input.transcriptOrigin.trim() || "RIGHTS_HOLDER_FILE", descriptionVi: input.descriptionVi?.trim() || null, thumbnailUrl: input.thumbnailUrl?.trim() || null, rightsEvidenceNote: input.rightsEvidenceNote.trim() }; }
function toLesson(id: string, data: Record<string, unknown> | undefined): DictationLesson | null { if (!data || typeof data.title !== "string" || typeof data.youtubeVideoId !== "string") return null; return { id, status: enumValue(data.status, ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"], "DRAFT"), orderIndex: numberValue(data.orderIndex), title: stringValue(data.title), slug: stringValue(data.slug), descriptionVi: nullableString(data.descriptionVi), sourceName: stringValue(data.sourceName), sourceType: enumValue(data.sourceType, ["PARTNER_PERMISSION", "CC_BY", "PUBLIC_DOMAIN", "NC_LICENSE", "OTHER_LICENSE"], "OTHER_LICENSE"), sourceUrl: stringValue(data.sourceUrl), youtubeVideoId: stringValue(data.youtubeVideoId), embedUrl: stringValue(data.embedUrl) || `https://www.youtube-nocookie.com/embed/${stringValue(data.youtubeVideoId)}`, thumbnailUrl: nullableString(data.thumbnailUrl), durationSeconds: numberValue(data.durationSeconds), language: "en", accent: nullableString(data.accent), level: enumValue(data.level, ["A2", "B1", "B2", "C1"], "B1"), topics: stringArray(data.topics), segmentCount: numberValue(data.segmentCount), wordCount: numberValue(data.wordCount), estimatedWpm: nullableNumber(data.estimatedWpm), transcriptOrigin: stringValue(data.transcriptOrigin), licenseStatus: enumValue(data.licenseStatus, ["PENDING", "VERIFIED", "EXPIRED"], "PENDING"), publicAttribution: stringValue(data.publicAttribution), rightsId: nullableString(data.rightsId), publishedAtMillis: nullableNumber(data.publishedAtMillis), createdAtMillis: numberValue(data.createdAtMillis), updatedAtMillis: numberValue(data.updatedAtMillis) }; }
function toSegment(id: string, data: Record<string, unknown> | undefined): DictationSegment | null { if (!data || typeof data.expectedText !== "string" || typeof data.lessonId !== "string") return null; return { id, lessonId: stringValue(data.lessonId), index: numberValue(data.index), startSeconds: numberValue(data.startSeconds), endSeconds: numberValue(data.endSeconds), leadInSeconds: numberValue(data.leadInSeconds), tailSeconds: numberValue(data.tailSeconds), speaker: nullableString(data.speaker), expectedText: stringValue(data.expectedText), acceptedNormalizedAnswers: stringArray(data.acceptedNormalizedAnswers), translationVi: nullableString(data.translationVi), wordCount: numberValue(data.wordCount), status: enumValue(data.status, ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"], "DRAFT"), createdAtMillis: numberValue(data.createdAtMillis), updatedAtMillis: numberValue(data.updatedAtMillis) }; }
function toSummary(lessonId: string, data: Record<string, unknown> | undefined): DictationProgressSummary | null { if (!data) return null; return { lessonId, lessonTitleSnapshot: stringValue(data.lessonTitleSnapshot), sourceNameSnapshot: stringValue(data.sourceNameSnapshot), levelSnapshot: enumValue(data.levelSnapshot, ["A2", "B1", "B2", "C1"], "B1"), segmentCountSnapshot: numberValue(data.segmentCountSnapshot), completedCount: numberValue(data.completedCount), masteredCount: numberValue(data.masteredCount), lastSegmentIndex: numberValue(data.lastSegmentIndex), lastMaskPercent: validateMaskSafe(data.lastMaskPercent), startedAtMillis: numberValue(data.startedAtMillis), lastStudiedAtMillis: numberValue(data.lastStudiedAtMillis), completedAtMillis: nullableNumber(data.completedAtMillis), updatedAtMillis: numberValue(data.updatedAtMillis) }; }
function toSegmentProgress(lessonId: string, segmentId: string, data: Record<string, unknown> | undefined): DictationSegmentProgress | null { if (!data) return null; return { lessonId, segmentId, segmentIndex: numberValue(data.segmentIndex), attemptCount: numberValue(data.attemptCount), replayCount: numberValue(data.replayCount), hintCount: numberValue(data.hintCount), lastMaskPercent: validateMaskSafe(data.lastMaskPercent), highestPassedMaskPercent: [30, 50, 100].includes(Number(data.highestPassedMaskPercent)) ? Number(data.highestPassedMaskPercent) as 30 | 50 | 100 : 0, lastScorePercent: numberValue(data.lastScorePercent), lastAnswer: nullableString(data.lastAnswer), completedAtMillis: nullableNumber(data.completedAtMillis), masteredAtMillis: nullableNumber(data.masteredAtMillis), lastStudiedAtMillis: numberValue(data.lastStudiedAtMillis), updatedAtMillis: numberValue(data.updatedAtMillis) }; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function nullableNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function wordCount(value: string): number { return value.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)?/g)?.length ?? 0; }
function estimateWpm(cues: Array<{ startSeconds: number; endSeconds: number; text: string }>): number | null { if (!cues.length) return null; const seconds = cues.at(-1)!.endSeconds - cues[0].startSeconds; return seconds > 0 ? Math.round((cues.reduce((sum, cue) => sum + wordCount(cue.text), 0) / seconds) * 60) : null; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0)); }
function validateMaskSafe(value: unknown): MaskPercent { return [30, 50, 100].includes(Number(value)) ? Number(value) as MaskPercent : 30; }
async function audit(action: string, lessonId: string, uid: string) { await adminDb.collection(COLLECTIONS.contentAuditLogs).add({ module: "DICTATION", action, lessonId, actorUid: uid, createdAtMillis: Date.now(), createdAt: FieldValue.serverTimestamp() }); }
