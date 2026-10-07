/**
 * Vocabulary service.
 * Port of `service/VocabService.java` — the core vocabulary domain logic.
 *
 * Uses Firebase Admin Firestore directly (no Prisma/SQL).
 * Collections: vocabSets, vocabWords, vocabFolders, counters
 * User progress: users/{uid}/userVocabProgress/{wordId}
 */
import { adminDb } from "@/lib/firestore/db";
import { cache } from "react";
import { vocabularyDetails } from "@/lib/vocab-content";
import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomInt } from "crypto";
import { BadRequest, Forbidden, NotFound, Unauthorized } from "@/lib/api/response";
import type {
  VocabSetDoc,
  VocabWordDoc,
  VocabFolderDoc,
  VocabProgressDoc,
  VocabSetCard,
  MyVocabSetCard,
  MyVocabFolderCard,
  CommunityVocabFolderCard,
  CommunityVocabSetCard,
  VocabProgressSetCard,
  VocabWordCard,
  VocabSetDetail,
  VocabSetSession,
  VocabStudyHistoryCard,
  VocabStudyHistoryDoc,
  AiVocabCandidate,
  VocabReviewResponse,
  VocabProgressStatus,
  ContentStatus,
  SourceType,
} from "@/types/vocab";
import {
  suggestWordsFromTopic,
  suggestWordsFromReading,
  suggestWordsFromImage,
} from "./gemini";
import { enrichCandidatePronunciation, enrichWithDictionary } from "./dictionary";
import { parseImportFile, parseDelimitedWords } from "@/lib/parsers/vocab-import";
import { getStoredStudyStreakSummary, getStudyStreak, recordStudyActivity, studyActivityDayRef, writeStudyActivityInTransaction } from "./study-activity";
import { invalidateLearnerActivityCaches } from "./learner-cache";
import { enforceDailyActionLimit } from "./rate-limit";
import { findDriveVocabSet, findDriveVocabWords, findDriveVocabWordsByIds, listDriveVocabSets } from "./dautoeic-vocab";

/* ------------------------------------------------------------------ */
/*  Collection constants                                               */
/* ------------------------------------------------------------------ */

const SETS = "vocabSets";
const WORDS = "vocabWords";
const FOLDERS = "vocabFolders";
const PROGRESS = "userVocabProgress";
const HISTORY = "vocabStudyHistory";
const DAILY_NEW_WORD_GOAL = 20;

/* ------------------------------------------------------------------ */
/*  Query helpers                                                      */
/* ------------------------------------------------------------------ */

// Deduped per request via React cache(): when a single page render calls
// publishedSets() from several code paths (e.g. findMySetCards + LearnTab),
// Firestore is hit only once. Stays fresh on every navigation, so data is
// always correct immediately after a mutation.
const publishedSets = cache(async (): Promise<VocabSetDoc[]> => {
  const snap = await adminDb
    .collection(SETS)
    .where("status", "==", "PUBLISHED")
    .get();
  const sets = snap.docs
    .map(toSetDoc)
    .filter((s) => s.status === "PUBLISHED" && !s.deletedAtMillis);
  const driveSets = await listDriveVocabSets();
  const driveIds = new Set(driveSets.map((set) => set.id));
  return [...sets.filter((set) => !driveIds.has(set.id)), ...driveSets];
});

async function liveFolders(): Promise<VocabFolderDoc[]> {
  const snap = await adminDb
    .collection(FOLDERS)
    .where("deletedAtMillis", "==", null)
    .get();
  return snap.docs.map(toFolderDoc).filter((f) => !f.deletedAtMillis);
}

async function liveOwnerSets(uid: string): Promise<VocabSetDoc[]> {
  const snap = await adminDb
    .collection(SETS)
    .where("ownerUid", "==", uid)
    .where("status", "==", "PUBLISHED")
    .get();
  return snap.docs
    .map(toSetDoc)
    .filter((s) => s.ownerUid === uid && s.status === "PUBLISHED" && !s.deletedAtMillis);
}

async function liveOwnerFolders(uid: string): Promise<VocabFolderDoc[]> {
  const snap = await adminDb
    .collection(FOLDERS)
    .where("ownerUid", "==", uid)
    .get();
  return snap.docs
    .map(toFolderDoc)
    .filter((f) => f.ownerUid === uid && !f.deletedAtMillis);
}

async function liveSetsByIds(setIds: number[]): Promise<VocabSetDoc[]> {
  const uniqueIds = [...new Set(setIds)].filter((id) => Number.isFinite(id));
  if (!uniqueIds.length) return [];

  const driveSets = (await Promise.all(uniqueIds.map(findDriveVocabSet))).filter((set): set is VocabSetDoc => set !== null);
  const driveIds = new Set(driveSets.map((set) => set.id));
  const refs = uniqueIds.filter((id) => !driveIds.has(id)).map((id) => adminDb.collection(SETS).doc(String(id)));
  const snaps = refs.length ? await adminDb.getAll(...refs) : [];
  return [...driveSets, ...snaps
    .filter((snap) => snap.exists)
    .map(toSetDoc)
    .filter((s) => s.status === "PUBLISHED" && !s.deletedAtMillis)];
}

async function findPublishedSet(setId: number): Promise<VocabSetDoc | null> {
  const driveSet = await findDriveVocabSet(setId);
  if (driveSet) return driveSet;
  const doc = await adminDb.collection(SETS).doc(String(setId)).get();
  if (!doc.exists) return null;
  const set = toSetDoc(doc);
  if (set.status !== "PUBLISHED" || set.deletedAtMillis) return null;
  return set;
}

async function wordsForSet(setId: number): Promise<VocabWordDoc[]> {
  const driveWords = await findDriveVocabWords(setId);
  if (driveWords) return driveWords;
  const snap = await adminDb
    .collection(WORDS)
    .where("setId", "==", setId)
    .where("status", "==", "PUBLISHED")
    .get();
  return snap.docs
    .map(toWordDoc)
    .filter((w) => w.setId === setId && w.status === "PUBLISHED" && !w.deletedAtMillis);
}

async function wordsForSetPart(
  setId: number,
  externalPartId?: string | null,
): Promise<VocabWordDoc[]> {
  const driveWords = await findDriveVocabWords(setId, externalPartId);
  if (driveWords) return driveWords;
  const words = await wordsForSet(setId);
  const cleanPartId = externalPartId?.trim();
  if (!cleanPartId) return words;
  return words.filter((word) => word.externalPartId === cleanPartId);
}

async function wordsByIds(wordIds: number[]): Promise<Map<number, VocabWordDoc>> {
  const words = await findDriveVocabWordsByIds(wordIds);
  const missing = [...new Set(wordIds)].filter((id) => !words.has(id));
  if (missing.length) {
    const snapshots = await adminDb.getAll(...missing.map((id) => adminDb.collection(WORDS).doc(String(id))));
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const word = toWordDoc(snapshot);
      if (word.status === "PUBLISHED" && !word.deletedAtMillis) words.set(word.id, word);
    }
  }
  return words;
}

async function wordKeysForSet(setId: number): Promise<string[]> {
  const snap = await adminDb
    .collection(WORDS)
    .where("setId", "==", setId)
    .where("status", "==", "PUBLISHED")
    .select("word", "setId", "status", "deletedAtMillis")
    .get();
  return snap.docs
    .map((doc) => doc.data() ?? {})
    .filter((data) => numVal(data, "setId") === setId && !numVal(data, "deletedAtMillis"))
    .map((data) => strVal(data, "word")?.toLowerCase().trim() ?? "")
    .filter(Boolean);
}

async function resolveLegacyWordCounts(sets: VocabSetDoc[]): Promise<VocabSetDoc[]> {
  const missing = sets.filter((set) => set.wordCount == null);
  if (!missing.length) return sets;

  const counts = new Map<number, number>();
  for (let index = 0; index < missing.length; index += 30) {
    const ids = missing.slice(index, index + 30).map((set) => set.id);
    const snap = await adminDb
      .collection(WORDS)
      .where("setId", "in", ids)
      .select("setId", "status", "deletedAtMillis")
      .get();
    for (const doc of snap.docs) {
      if (strVal(doc.data(), "status") !== "PUBLISHED" || numVal(doc.data(), "deletedAtMillis")) continue;
      const setId = numVal(doc.data(), "setId");
      if (setId != null) counts.set(setId, (counts.get(setId) ?? 0) + 1);
    }
  }

  for (let index = 0; index < missing.length; index += 450) {
    const batch = adminDb.batch();
    for (const set of missing.slice(index, index + 450)) {
      batch.set(adminDb.collection(SETS).doc(String(set.id)), {
        wordCount: counts.get(set.id) ?? 0,
      }, { merge: true });
    }
    await batch.commit();
  }

  return sets.map((set) => set.wordCount != null
    ? set
    : { ...set, wordCount: counts.get(set.id) ?? 0 });
}

async function userProgressDocs(uid: string): Promise<VocabProgressDoc[]> {
  const snap = await progressCollection(uid).get();
  return snap.docs.map(toProgressDoc);
}

function progressCollection(uid: string) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection(PROGRESS);
}

async function countProgress(uid: string): Promise<number> {
  const snap = await progressCollection(uid).count().get();
  return snap.data().count;
}

async function countProgressByStatuses(
  uid: string,
  statuses: VocabProgressStatus[],
): Promise<number> {
  const snap = await progressCollection(uid)
    .where("status", "in", statuses)
    .count()
    .get();
  return snap.data().count;
}

async function progressForSet(
  uid: string,
  setId: number,
): Promise<VocabProgressDoc[]> {
  const snap = await progressCollection(uid).where("setId", "==", setId).get();
  return snap.docs.map(toProgressDoc);
}

async function findProgress(
  uid: string,
  wordId: number,
): Promise<VocabProgressDoc | null> {
  const doc = await adminDb
    .collection("users")
    .doc(uid)
    .collection(PROGRESS)
    .doc(String(wordId))
    .get();
  if (!doc.exists) return null;
  return toProgressDoc(doc);
}

async function saveProgress(progress: VocabProgressDoc): Promise<void> {
  const data = progressPayload(progress);
  const userRef = adminDb.collection("users").doc(progress.uid);
  const progressRef = userRef.collection(PROGRESS).doc(String(progress.wordId));
  const now = Date.now();
  await adminDb.runTransaction(async (tx) => {
    const [previousSnap, userSnap] = await Promise.all([
      tx.get(progressRef),
      tx.get(userRef),
    ]);
    const previous = previousSnap.exists ? toProgressDoc(previousSnap) : null;
    const userData = userSnap.data() ?? {};
    const previousMastered = previous?.status === "MASTERED";
    const nextMastered = progress.status === "MASTERED";
    const previousDue = previous ? isDueProgress(previous, now) : false;
    const nextDue = isDueProgress(progress, now);
    const masteredDelta = Number(nextMastered) - Number(previousMastered);
    const dueDelta = Number(nextDue) - Number(previousDue);
    const nextDueAtMillis = nextSummaryDueAtMillis(userData, [progress]);

    tx.set(progressRef, data, { merge: true });
    writeProgressSummary(tx, userRef, userData, {
      masteredDelta,
      dueDelta,
      nextDueAtMillis,
      now,
    });
  });
}

function progressPayload(progress: VocabProgressDoc): Record<string, unknown> {
  const data: Record<string, unknown> = {
    uid: progress.uid,
    wordId: progress.wordId,
    setId: progress.setId,
    status: progress.status,
    interval: progress.interval,
    easeFactor: progress.easeFactor,
    repetitions: progress.repetitions,
  };
  if (progress.nextReviewAtMillis != null) {
    data.nextReviewAtMillis = progress.nextReviewAtMillis;
  }
  if (progress.lastReviewedAtMillis != null) {
    data.lastReviewedAtMillis = progress.lastReviewedAtMillis;
  }
  return data;
}

function nextSummaryDueAtMillis(
  userData: Record<string, unknown>,
  progressItems: VocabProgressDoc[],
): number | null {
  const currentNextDue = numVal(userData, "vocabNextDueAtMillis");
  const candidateNextDue = progressItems
    .map((item) => item.nextReviewAtMillis)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | null>((min, value) => min == null ? value : Math.min(min, value), null);
  return currentNextDue == null
    ? candidateNextDue
    : candidateNextDue == null
      ? currentNextDue
      : Math.min(currentNextDue, candidateNextDue);
}

function writeProgressSummary(
  tx: FirebaseFirestore.Transaction,
  userRef: FirebaseFirestore.DocumentReference,
  userData: Record<string, unknown>,
  input: {
    masteredDelta: number;
    dueDelta: number;
    nextDueAtMillis: number | null;
    now: number;
  },
): void {
  // New/provisioned users have these aggregates. Legacy users are left
  // untouched here so the hub can reconcile the complete collection once.
  const hasSummary =
    typeof userData.vocabMasteredWords === "number" &&
    typeof userData.vocabDueWords === "number";
  if (!hasSummary) return;
  tx.set(userRef, {
    ...(input.masteredDelta
      ? { vocabMasteredWords: FieldValue.increment(input.masteredDelta) }
      : {}),
    ...(input.dueDelta ? { vocabDueWords: FieldValue.increment(input.dueDelta) } : {}),
    vocabNextDueAtMillis: input.nextDueAtMillis,
    vocabSummaryUpdatedAtMillis: input.now,
  }, { merge: true });
}

function historyCollection(uid: string) {
  return adminDb.collection("users").doc(uid).collection(HISTORY);
}

/* ------------------------------------------------------------------ */
/*  Public: Stats                                                      */
/* ------------------------------------------------------------------ */

export async function totalWords(uid: string): Promise<number> {
  requireUid(uid);
  return countProgress(uid);
}

export async function learnedWords(uid: string): Promise<number> {
  requireUid(uid);
  return countProgressByStatuses(uid, ["LEARNING", "REVIEWING", "MASTERED"]);
}

export async function masteredWords(uid: string): Promise<number> {
  requireUid(uid);
  return countProgressByStatuses(uid, ["MASTERED"]);
}

export async function dueWords(uid: string): Promise<number> {
  requireUid(uid);
  const now = Date.now();
  const snap = await progressCollection(uid)
    .where("status", "in", ["LEARNING", "REVIEWING", "MASTERED"])
    .where("nextReviewAtMillis", "<=", now)
    .count()
    .get();
  return snap.data().count;
}

export function dailyNewWordGoal(): number {
  return DAILY_NEW_WORD_GOAL;
}

export async function studiedWordsToday(uid: string): Promise<number> {
  requireUid(uid);
  const todayStart = vocabDayStartForMillis(Date.now());
  const snap = await progressCollection(uid)
    .where("lastReviewedAtMillis", ">=", todayStart)
    .count()
    .get();
  return snap.data().count;
}

export async function streakDays(uid: string): Promise<number> {
  requireUid(uid);
  const streak = await getStudyStreak(uid);
  return streak.streakDays;
}

export async function refreshVocabHubSummary(uid: string): Promise<{
  masteredWords: number;
  dueWords: number;
  nextDueAtMillis: number | null;
}> {
  requireUid(uid);
  const now = Date.now();
  const progress = await userProgressDocs(uid);
  const mastered = progress.filter((item) => item.status === "MASTERED").length;
  const due = progress.filter((item) => isDueProgress(item, now)).length;
  const nextDueAtMillis = progress
    .map((item) => item.nextReviewAtMillis)
    .filter((value): value is number => typeof value === "number" && value > now)
    .reduce<number | null>((min, value) => min == null ? value : Math.min(min, value), null);
  await adminDb.collection("users").doc(uid).set({
    vocabMasteredWords: mastered,
    vocabDueWords: due,
    vocabNextDueAtMillis: nextDueAtMillis,
    vocabSummaryUpdatedAtMillis: now,
  }, { merge: true });
  return { masteredWords: mastered, dueWords: due, nextDueAtMillis };
}

/* ------------------------------------------------------------------ */
/*  Public: Set queries                                                */
/* ------------------------------------------------------------------ */

export async function findSetCards(topic?: string): Promise<VocabSetCard[]> {
  const sets = await publishedSets();

  let filtered = sets;
  if (topic) {
    const lower = topic.toLowerCase();
    filtered = sets.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        s.topic.toLowerCase().includes(lower),
      );
  }
  filtered = await resolveLegacyWordCounts(filtered);
  return filtered.map((set) => ({
    id: set.id,
    title: set.title,
    topic: set.topic,
    icon: set.icon,
    level: set.level,
    wordCount: set.wordCount ?? 0,
  }));
}

export async function findPracticeSetOptions(
  uid: string | null,
): Promise<VocabSetCard[]> {
  if (!uid) return [];
  const progress = await userProgressDocs(uid);
  const setIds = new Set(progress.map((p) => p.setId));
  const filteredSets = await resolveLegacyWordCounts(await liveSetsByIds([...setIds]));

  return filteredSets
    .map((set) => ({
      id: set.id,
      title: set.title,
      topic: set.topic,
      icon: set.icon,
      level: set.level,
      wordCount: set.wordCount ?? 0,
    }));
}

export async function findMySetCards(
  uid: string | null,
  folderId?: number | null,
): Promise<MyVocabSetCard[]> {
  if (!uid) return [];
  const sets = await liveOwnerSets(uid);
  const folders = await liveOwnerFolders(uid);
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));

  let mySets = sets.filter((s) => s.ownerUid === uid);
  if (folderId != null) {
    mySets = mySets.filter((s) => s.folderId === folderId);
  }
  mySets = await resolveLegacyWordCounts(mySets);

  return mySets.map((set) => {
    const folder = set.folderId != null ? foldersById.get(set.folderId) : undefined;
    return {
      id: set.id,
      title: set.title,
      topic: set.topic,
      icon: set.icon,
      level: set.level,
      wordCount: set.wordCount ?? 0,
      folderId: set.folderId,
      folderName: folder?.name,
    };
  });
}

export async function findMyFolderCards(
  uid: string,
  search?: string | null,
): Promise<MyVocabFolderCard[]> {
  requireUid(uid);
  const sets = await liveOwnerSets(uid);

  let myFolders = await liveOwnerFolders(uid);
  if (search) {
    const lower = search.toLowerCase();
    myFolders = myFolders.filter((f) => f.name.toLowerCase().includes(lower));
  }

  const setCountByFolderId = new Map<number, number>();
  for (const set of sets) {
    if (set.folderId == null) continue;
    setCountByFolderId.set(set.folderId, (setCountByFolderId.get(set.folderId) ?? 0) + 1);
  }

  return myFolders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    publicShared: folder.publicShared,
    setCount: setCountByFolderId.get(folder.id) ?? 0,
  }));
}

export async function findMyTabCards(
  uid: string,
  folderId?: number | null,
  search?: string | null,
): Promise<{ sets: MyVocabSetCard[]; folders: MyVocabFolderCard[] }> {
  requireUid(uid);
  const [sets, folders] = await Promise.all([
    liveOwnerSets(uid),
    liveOwnerFolders(uid),
  ]);
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));

  let mySets = sets.filter((set) => set.ownerUid === uid);
  if (folderId != null) {
    mySets = mySets.filter((set) => set.folderId === folderId);
  }
  mySets = await resolveLegacyWordCounts(mySets);

  let myFolders = folders;
  if (search?.trim()) {
    const lower = search.toLowerCase();
    myFolders = myFolders.filter((folder) => folder.name.toLowerCase().includes(lower));
  }

  const setCountByFolderId = folderCounts(sets);

  return {
    sets: mySets.map((set) => {
      const folder = set.folderId != null ? foldersById.get(set.folderId) : undefined;
      return {
        id: set.id,
        title: set.title,
        topic: set.topic,
        icon: set.icon,
        level: set.level,
        wordCount: set.wordCount ?? 0,
        folderId: set.folderId,
        folderName: folder?.name,
      };
    }),
    folders: myFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      publicShared: folder.publicShared,
      setCount: setCountByFolderId.get(folder.id) ?? 0,
    })),
  };
}

export async function findCommunityFolderCards(
  search?: string | null,
): Promise<CommunityVocabFolderCard[]> {
  const folders = await liveFolders();
  const sets = await publishedSets();

  let shared = folders.filter((f) => f.publicShared);
  if (search) {
    const lower = search.toLowerCase();
    shared = shared.filter((f) => f.name.toLowerCase().includes(lower));
  }

  return shared.map((folder) => ({
    id: folder.id,
    name: folder.name,
    ownerName: folder.ownerName,
    setCount: sets.filter((s) => s.folderId === folder.id).length,
  }));
}

export async function getCommunityFolderCard(
  folderId: number,
): Promise<CommunityVocabFolderCard | null> {
  const folders = await liveFolders();
  const folder = folders.find((f) => f.id === folderId && f.publicShared);
  if (!folder) return null;
  const sets = await publishedSets();
  return {
    id: folder.id,
    name: folder.name,
    ownerName: folder.ownerName,
    setCount: sets.filter((s) => s.folderId === folder.id).length,
  };
}

export async function findCommunitySetCards(
  folderId: number,
): Promise<CommunityVocabSetCard[]> {
  const sets = await publishedSets();
  const folderSets = await resolveLegacyWordCounts(
    sets.filter((s) => s.folderId === folderId),
  );

  return folderSets
    .map((set) => ({
      id: set.id,
      title: set.title,
      topic: set.topic,
      wordCount: set.wordCount ?? 0,
    }));
}

/* ------------------------------------------------------------------ */
/*  Public: Progress                                                   */
/* ------------------------------------------------------------------ */

export async function findProgressSetCards(
  uid: string,
): Promise<VocabProgressSetCard[]> {
  requireUid(uid);
  const progress = await userProgressDocs(uid);
  const now = Date.now();

  const setIds = new Set(progress.map((p) => p.setId));
  const relevantSets = await resolveLegacyWordCounts(await liveSetsByIds([...setIds]));

  return relevantSets
    .map((set) => {
      const setProgress = progress.filter((p) => p.setId === set.id);

      return {
        id: set.id,
        title: set.title,
        topic: set.topic,
        icon: set.icon,
        sourceType: set.sourceType,
        externalTestId: set.externalTestId,
        totalWords: set.wordCount ?? 0,
        learnedWords: setProgress.filter((p) => p.status !== "NEW").length,
        masteredWords: setProgress.filter((p) => p.status === "MASTERED")
          .length,
        dueWords: setProgress.filter(
          (p) =>
            p.status !== "NEW" &&
            p.nextReviewAtMillis != null &&
            p.nextReviewAtMillis <= now,
        ).length,
      };
    })
    .sort(
      (a, b) => b.dueWords - a.dueWords || b.learnedWords - a.learnedWords,
    );
}

export async function progressOverview(uid: string): Promise<{
  totalWords: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
  studiedWordsToday: number;
  streakDays: number;
  dailyNewWordGoal: number;
  progressSets: VocabProgressSetCard[];
  practiceOptions: VocabSetCard[];
}> {
  requireUid(uid);
  const now = Date.now();
  const todayStart = vocabDayStartForMillis(now);
  const [progress, studyStreak] = await Promise.all([
    userProgressDocs(uid),
    getStoredStudyStreakSummary(uid).then((summary) => summary ?? getStudyStreak(uid)),
  ]);
  const learnedStatuses = new Set<VocabProgressStatus>([
    "LEARNING",
    "REVIEWING",
    "MASTERED",
  ]);
  const setIds = [...new Set(progress.map((item) => item.setId))];
  const relevantSets = await resolveLegacyWordCounts(await liveSetsByIds(setIds));
  const progressBySetId = new Map<number, VocabProgressDoc[]>();
  for (const item of progress) {
    const bucket = progressBySetId.get(item.setId);
    if (bucket) bucket.push(item);
    else progressBySetId.set(item.setId, [item]);
  }

  const progressSets = relevantSets
    .map((set) => {
      const setProgress = progressBySetId.get(set.id) ?? [];
      return {
        id: set.id,
        title: set.title,
        topic: set.topic,
        icon: set.icon,
        sourceType: set.sourceType,
        externalTestId: set.externalTestId,
        totalWords: set.wordCount ?? 0,
        learnedWords: setProgress.filter((item) => item.status !== "NEW").length,
        masteredWords: setProgress.filter((item) => item.status === "MASTERED").length,
        dueWords: setProgress.filter((item) => isDueProgress(item, now)).length,
      };
    })
    .sort((a, b) => b.dueWords - a.dueWords || b.learnedWords - a.learnedWords);

  return {
    totalWords: progress.length,
    learnedWords: progress.filter((item) => learnedStatuses.has(item.status)).length,
    masteredWords: progress.filter((item) => item.status === "MASTERED").length,
    dueWords: progress.filter((item) => isDueProgress(item, now)).length,
    studiedWordsToday: progress.filter(
      (item) => item.lastReviewedAtMillis != null && item.lastReviewedAtMillis >= todayStart,
    ).length,
    streakDays: studyStreak.streakDays,
    dailyNewWordGoal: dailyNewWordGoal(),
    progressSets,
    practiceOptions: relevantSets.map((set) => ({
      id: set.id,
      title: set.title,
      topic: set.topic,
      icon: set.icon,
      level: set.level,
      wordCount: set.wordCount ?? 0,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Public: Sessions                                                   */
/* ------------------------------------------------------------------ */

export async function getSession(setId: number): Promise<VocabSetSession> {
  const set = await findPublishedSet(setId);
  if (!set) throw NotFound("Set not found");
  const words = await wordsForSet(setId);
  return {
    set: {
      id: set.id,
      title: set.title,
      topic: set.topic,
      sourceType: set.sourceType,
      externalTestId: set.externalTestId,
    },
    words: words.map((w) => toWordCard(w, false)),
  };
}

/** Read-only entry point for continuing a set or reviewing its mastered words. */
export async function getStudyEntrySession(
  setId: number,
  uid: string | null,
  intent: "continue" | "review",
  externalPartId?: string,
): Promise<VocabSetSession> {
  if (intent === "review") requireUid(uid);
  const set = await findPublishedSet(setId);
  if (!set) throw NotFound("Set not found");
  const [words, progress] = await Promise.all([
    wordsForSet(setId),
    uid ? progressForSet(uid, setId) : [],
  ]);
  const progressByWordId = new Map(progress.map((item) => [item.wordId, item]));
  const isMastered = (word: VocabWordDoc) => progressByWordId.get(word.id)?.status === "MASTERED";
  // Drive lookup supplies ordered parts. Preserve their order while ensuring
  // words within each part follow the source ordering, including Firestore sets.
  const parts = new Map<string | undefined, VocabWordDoc[]>();
  for (const word of words) {
    const partWords = parts.get(word.externalPartId) ?? [];
    partWords.push(word);
    parts.set(word.externalPartId, partWords);
  }
  for (const partWords of parts.values()) {
    partWords.sort((left, right) => (left.externalOrderIndex ?? 0) - (right.externalOrderIndex ?? 0));
  }
  const partRank = (partWords: VocabWordDoc[]) => {
    const name = partWords[0]?.externalPartName?.trim().toUpperCase();
    return name === "LC" ? 0 : name === "RC" ? 1 : 2;
  };
  const orderedParts = [...parts].sort((left, right) => partRank(left[1]) - partRank(right[1]));
  const requestedPartId = externalPartId?.trim() || undefined;
  if (requestedPartId && !parts.has(requestedPartId)) throw NotFound("Vocabulary part not found");
  let selectedPartId = requestedPartId;
  let scopedWords: VocabWordDoc[];
  if (intent === "continue") {
    const selectedPart = requestedPartId
      ? [requestedPartId, parts.get(requestedPartId)!] as const
      : orderedParts.find(([, partWords]) => partWords.some((word) => !isMastered(word)))
        ?? orderedParts[0];
    selectedPartId = selectedPart?.[0];
    scopedWords = selectedPart?.[1] ?? [];
  } else {
    scopedWords = requestedPartId ? parts.get(requestedPartId)! : orderedParts.flatMap(([, partWords]) => partWords);
  }
  const masteredWords = scopedWords.filter(isMastered).length;
  let sessionWords = scopedWords;
  if (intent === "review") {
    const now = Date.now();
    sessionWords = orderWordsForReview(scopedWords.filter(isMastered), progressByWordId, now);
  }
  const partName = selectedPartId ? scopedWords[0]?.externalPartName : undefined;
  return {
    set: {
      id: set.id,
      title: partName ? `${set.title} - ${partName}` : set.title,
      topic: set.topic,
      sourceType: set.sourceType,
      externalTestId: set.externalTestId,
      externalPartId: selectedPartId,
    },
    words: sessionWords.map((word) => toWordCard(word, isMastered(word))),
    masteredWords,
    totalWords: scopedWords.length,
  };
}

export async function getFilteredSession(
  setId: number,
  uid: string | null,
  mastery: string,
  order: string,
  amount: string,
  includeHistory = true,
): Promise<VocabSetSession> {
  const set = await findPublishedSet(setId);
  if (!set) throw NotFound("Set not found");
  const [words, progress, history] = await Promise.all([
    wordsForSet(setId),
    uid ? progressForSet(uid, setId) : [],
    uid && includeHistory ? findStudyHistory(uid, setId) : [],
  ]);
  const progressByWordId = new Map(progress.map((p) => [p.wordId, p]));
  const now = Date.now();
  const normalizedMastery = normalizeMastery(mastery);

  let filtered = words;
  if (normalizedMastery !== "all" && uid) {
    filtered = words.filter((w) =>
      matchesMastery(w, progressByWordId, normalizedMastery, now),
    );
  }

  if (order === "random") {
    filtered = shuffleArray([...filtered]);
  } else if (order === "oldest") {
    filtered = orderWordsForReview(filtered, progressByWordId, now);
  }

  const total = filtered.length;
  const limit = parseAmount(amount, total);
  filtered = filtered.slice(0, limit);

  return {
    set: {
      id: set.id,
      title: set.title,
      topic: set.topic,
      sourceType: set.sourceType,
      externalTestId: set.externalTestId,
    },
    words: filtered.map((w) => {
      const prog = progressByWordId.get(w.id);
      return toWordCard(w, prog?.status === "MASTERED");
    }),
    history,
    masteredWords: words.filter((word) => progressByWordId.get(word.id)?.status === "MASTERED").length,
    totalWords: words.length,
  };
}

export async function getFilteredSessionForPart(
  setId: number,
  uid: string | null,
  externalPartId: string,
  mastery: string,
  order: string,
  amount: string,
  includeHistory = true,
): Promise<VocabSetSession> {
  const set = await findPublishedSet(setId);
  if (!set) throw NotFound("Set not found");
  const [words, progress, history] = await Promise.all([
    wordsForSetPart(setId, externalPartId),
    uid ? progressForSet(uid, setId) : [],
    uid && includeHistory ? findStudyHistory(uid, setId, externalPartId) : [],
  ]);
  const progressByWordId = new Map(progress.map((p) => [p.wordId, p]));
  const now = Date.now();
  const normalizedMastery = normalizeMastery(mastery);

  let filtered = words;
  if (normalizedMastery !== "all" && uid) {
    filtered = words.filter((w) =>
      matchesMastery(w, progressByWordId, normalizedMastery, now),
    );
  }

  if (order === "random") {
    filtered = shuffleArray([...filtered]);
  } else if (order === "oldest") {
    filtered = orderWordsForReview(filtered, progressByWordId, now);
  }

  const total = filtered.length;
  const limit = parseAmount(amount, total);
  filtered = filtered.slice(0, limit);
  const partName = words.find((word) => word.externalPartId === externalPartId)?.externalPartName;
  const masteredWords = words.filter((word) => progressByWordId.get(word.id)?.status === "MASTERED").length;

  return {
    set: {
      id: set.id,
      title: partName ? `${set.title} - ${partName}` : set.title,
      topic: set.topic,
      sourceType: set.sourceType,
      externalTestId: set.externalTestId,
      externalPartId,
    },
    words: filtered.map((w) => {
      const prog = progressByWordId.get(w.id);
      return toWordCard(w, prog?.status === "MASTERED");
    }),
    history,
    masteredWords,
    totalWords: words.length,
  };
}

export async function getReviewSession(
  uid: string,
  size: number,
): Promise<VocabSetSession> {
  requireUid(uid);
  const progress = await userProgressDocs(uid);
  const now = Date.now();
  const due = progress.filter(
    (p) =>
      p.status !== "NEW" &&
      p.nextReviewAtMillis != null &&
      p.nextReviewAtMillis <= now,
  );

  due.sort(
    (a, b) => (a.nextReviewAtMillis ?? 0) - (b.nextReviewAtMillis ?? 0),
  );

  const selected = due.slice(0, size);
  const wordMap = await wordsByIds(selected.map((progress) => progress.wordId));

  const cards: VocabWordCard[] = [];
  for (const p of selected) {
    const word = wordMap.get(p.wordId);
    if (word) {
      cards.push(toWordCard(word, p.status === "MASTERED"));
    }
  }

  return {
    set: { id: 0, title: "Ôn tập", topic: "Review" },
    words: shuffleArray(cards),
  };
}

/* ------------------------------------------------------------------ */
/*  Public: Set detail                                                 */
/* ------------------------------------------------------------------ */

export async function getSetDetail(
  setId: number,
  uid: string | null,
): Promise<VocabSetDetail> {
  const set = await findPublishedSet(setId);
  if (!set) throw NotFound("Set not found");

  const words = await wordsForSet(setId);
  const progress = uid ? await progressForSet(uid, setId) : [];
  const progressByWordId = new Map(progress.map((p) => [p.wordId, p]));

  const wordCards = words.map((w) => {
    const prog = progressByWordId.get(w.id);
    return toWordCard(w, prog?.status === "MASTERED");
  });

  const mastered = progress.filter((p) => p.status === "MASTERED").length;
  const total = words.length;

  return {
    set: {
      id: set.id,
      title: set.title,
      topic: set.topic,
      level: set.level,
      ownerUid: set.ownerUid,
    },
    words: wordCards,
    totalWords: total,
    masteredWords: mastered,
    progressPercent: total === 0 ? 0 : Math.round((mastered / total) * 100),
  };
}

/* ------------------------------------------------------------------ */
/*  Public: Study history                                              */
/* ------------------------------------------------------------------ */

export async function findStudyHistory(
  uid: string,
  setId: number,
  externalPartId?: string | null,
  limit = 8,
): Promise<VocabStudyHistoryCard[]> {
  requireUid(uid);
  const cleanPartId = externalPartId?.trim() || null;
  let query: FirebaseFirestore.Query = historyCollection(uid)
    .where("setId", "==", setId);
  if (cleanPartId) {
    query = query.where("externalPartId", "==", cleanPartId);
  }
  const snap = await query
    .orderBy("finishedAtMillis", "desc")
    .limit(Math.max(1, Math.min(20, limit)))
    .get();

  return snap.docs
    .map(toStudyHistoryDoc)
    .map(toStudyHistoryCard);
}

export async function recordStudyHistory(
  uid: string,
  input: {
    requestId?: string;
    setId: number;
    externalTestId?: string | null;
    externalPartId?: string | null;
    title: string;
    mode: string;
    startedAtMillis?: number | null;
    totalWords: number;
    correctWords: number;
    wrongWords: number;
    accuracy: number;
    score: number;
  },
): Promise<{ id: string }> {
  requireUid(uid);
  if (input.requestId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)) {
    throw BadRequest("Invalid history request ID");
  }
  const finishedAtMillis = Date.now();
  const id = input.requestId ? `request-${input.requestId}` : `${finishedAtMillis}-${randomInt(1000, 9999)}`;
  const source = input.externalTestId || input.externalPartId ? "DAUTOEIC" : "LOCAL";
  const data: VocabStudyHistoryDoc = {
    id,
    uid,
    source,
    setId: input.setId,
    title: input.title,
    mode: input.mode,
    startedAtMillis: input.startedAtMillis ?? finishedAtMillis,
    finishedAtMillis,
    totalWords: Math.max(0, input.totalWords),
    correctWords: Math.max(0, input.correctWords),
    wrongWords: Math.max(0, input.wrongWords),
    accuracy: Math.max(0, Math.min(100, input.accuracy)),
    score: Math.max(0, input.score),
  };
  if (input.externalTestId) data.externalTestId = input.externalTestId;
  if (input.externalPartId) data.externalPartId = input.externalPartId;
  const activity = {
    module: "vocab" as const,
    activityType: "vocab_game",
    sourceId: input.externalPartId ?? input.externalTestId ?? input.setId,
    occurredAtMillis: finishedAtMillis,
    durationSeconds: input.startedAtMillis != null && Number.isFinite(input.startedAtMillis)
      && input.startedAtMillis > 0 && input.startedAtMillis <= finishedAtMillis
      && finishedAtMillis - input.startedAtMillis <= 86_400_000
      ? Math.floor((finishedAtMillis - input.startedAtMillis) / 1000) : null,
  };
  const historyRef = historyCollection(uid).doc(id);
  if (input.requestId) {
    // History and accounting commit together. A lost HTTP response can be
    // replayed without awarding XP or study time a second time.
    const requestFingerprint = createHash("sha256").update(JSON.stringify([
      data.setId, data.externalTestId ?? null, data.externalPartId ?? null,
      data.title, data.mode, input.startedAtMillis ?? null, data.totalWords,
      data.correctWords, data.wrongWords, data.accuracy, data.score,
    ])).digest("hex");
    const existing = await historyRef.get();
    if (existing.exists) {
      if (existing.data()?.requestFingerprint !== requestFingerprint) {
        throw BadRequest("History request ID was reused with different results");
      }
      invalidateLearnerActivityCaches(uid);
      return { id };
    }
    await enforceDailyActionLimit(uid, "vocab-history", 200);
    const userRef = adminDb.collection("users").doc(uid);
    await adminDb.runTransaction(async (tx) => {
      const saved = await tx.get(historyRef);
      if (saved.exists) {
        if (saved.data()?.requestFingerprint !== requestFingerprint) {
          throw BadRequest("History request ID was reused with different results");
        }
        return;
      }
      const [daySnap, userSnap] = await Promise.all([
        tx.get(studyActivityDayRef(uid, finishedAtMillis)), tx.get(userRef),
      ]);
      tx.set(historyRef, { ...data, requestFingerprint });
      writeStudyActivityInTransaction(tx, uid, activity, daySnap, userSnap.data() ?? {});
    });
    invalidateLearnerActivityCaches(uid);
  } else {
    await enforceDailyActionLimit(uid, "vocab-history", 200);
    await historyRef.set(data);
    await recordStudyActivity(uid, activity).catch(() => undefined);
  }
  return { id };
}

/* ------------------------------------------------------------------ */
/*  Public: CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function createMySet(
  uid: string,
  title: string,
  description?: string,
  icon?: string,
): Promise<{ id: number }> {
  requireUid(uid);
  if (!title?.trim()) throw BadRequest("Title is required");

  const id = await newNumericId(SETS);
  const now = Date.now();
  const data: Record<string, unknown> = {
    id,
    ownerUid: uid,
    title: title.trim(),
    topic: title.trim(),
    description: description?.trim() || null,
    icon: normalizeIcon(icon),
    status: "PUBLISHED" satisfies ContentStatus,
    sourceType: "MANUAL" satisfies SourceType,
    wordCount: 0,
    publishedAtMillis: now,
    updatedAtMillis: now,
  };
  await adminDb.collection(SETS).doc(String(id)).set(data);
  return { id };
}

export async function createMyFolder(
  uid: string,
  name: string,
): Promise<{ id: number }> {
  requireUid(uid);
  if (!name?.trim()) throw BadRequest("Folder name is required");

  const id = await newNumericId(FOLDERS);
  const now = Date.now();
  const data: Record<string, unknown> = {
    id,
    ownerUid: uid,
    name: name.trim(),
    publicShared: false,
    createdAtMillis: now,
    updatedAtMillis: now,
    deletedAtMillis: null,
  };
  await adminDb.collection(FOLDERS).doc(String(id)).set(data);
  return { id };
}

export async function assignMySetToFolder(
  uid: string,
  setId: number,
  folderId: number | null,
): Promise<void> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  if (folderId != null) {
    await requireOwnedFolder(uid, folderId);
  }
  await adminDb
    .collection(SETS)
    .doc(String(setId))
    .update({
      folderId: folderId ?? FieldValue.delete(),
      updatedAtMillis: Date.now(),
    });
}

export async function shareMyFolder(
  uid: string,
  folderId: number,
): Promise<void> {
  requireUid(uid);
  await requireOwnedFolder(uid, folderId);
  await adminDb.collection(FOLDERS).doc(String(folderId)).update({
    publicShared: true,
    sharedAtMillis: Date.now(),
    updatedAtMillis: Date.now(),
  });
}

export async function renameMyFolder(
  uid: string,
  folderId: number,
  name: string,
): Promise<void> {
  requireUid(uid);
  if (!name?.trim()) throw BadRequest("Name is required");
  await requireOwnedFolder(uid, folderId);
  await adminDb.collection(FOLDERS).doc(String(folderId)).update({
    name: name.trim(),
    updatedAtMillis: Date.now(),
  });
}

export async function deleteMyFolder(
  uid: string,
  folderId: number,
): Promise<void> {
  requireUid(uid);
  await requireOwnedFolder(uid, folderId);
  const sets = await liveOwnerSets(uid);
  const folderSets = sets.filter((s) => s.folderId === folderId);
  const batch = adminDb.batch();
  for (const set of folderSets) {
    batch.update(adminDb.collection(SETS).doc(String(set.id)), {
      folderId: FieldValue.delete(),
      updatedAtMillis: Date.now(),
    });
  }
  batch.update(adminDb.collection(FOLDERS).doc(String(folderId)), {
    deletedAtMillis: Date.now(),
  });
  await batch.commit();
}

export async function renameMySet(
  uid: string,
  setId: number,
  title: string,
): Promise<void> {
  requireUid(uid);
  if (!title?.trim()) throw BadRequest("Title is required");
  await requireOwnedSet(uid, setId);
  await adminDb.collection(SETS).doc(String(setId)).update({
    title: title.trim(),
    updatedAtMillis: Date.now(),
  });
}

export async function deleteMySet(
  uid: string,
  setId: number,
): Promise<void> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  await adminDb.collection(SETS).doc(String(setId)).update({
    deletedAtMillis: Date.now(),
  });
}

/* ------------------------------------------------------------------ */
/*  Public: Word operations                                            */
/* ------------------------------------------------------------------ */

export async function addManualWords(
  uid: string,
  setId: number,
  rowsText: string,
): Promise<number> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  const candidates = parseDelimitedWords(rowsText);
  return saveCandidates(setId, candidates, "MANUAL", null, 200);
}

export async function importWords(
  uid: string,
  setId: number,
  fileBuffer: Buffer,
  filename: string,
): Promise<number> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  const candidates = await parseImportFile(fileBuffer, filename);
  return saveCandidates(setId, candidates, "IMPORT", filename, 500);
}

/* ------------------------------------------------------------------ */
/*  Public: AI word generation                                         */
/* ------------------------------------------------------------------ */

export async function generateWordsWithAi(
  setId: number,
  uid: string | null,
  mode: string,
  input: string,
  count: number,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<number> {
  requireUid(uid);
  const candidates = await previewAiWords(
    setId,
    uid,
    mode,
    input,
    count,
    imageBase64,
    imageMimeType,
  );
  return saveAiWords(setId, uid, candidates);
}

export async function previewAiWords(
  setId: number,
  uid: string,
  mode: string,
  input: string,
  count: number,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<AiVocabCandidate[]> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  const clampedCount = Math.min(Math.max(count, 1), 50);
  const existingWords = await wordKeysForSet(setId);

  let suggestedWords: string[];
  if (mode === "image" && imageBase64 && imageMimeType) {
    suggestedWords = await suggestWordsFromImage(
      imageBase64,
      imageMimeType,
      clampedCount + 10,
      existingWords,
    );
  } else if (mode === "reading") {
    suggestedWords = await suggestWordsFromReading(
      input,
      clampedCount + 10,
      existingWords,
    );
  } else if (mode === "words") {
    suggestedWords = input
      .split(/[\n,;|]+/)
      .map((word) => word.trim())
      .filter(Boolean);
  } else {
    suggestedWords = await suggestWordsFromTopic(
      input,
      clampedCount + 10,
      existingWords,
    );
  }

  const filtered = excludeExistingWords(
    suggestedWords,
    existingWords,
    clampedCount + 5,
  );

  return enrichWithDictionary(filtered, clampedCount);
}

export async function saveAiWords(
  setId: number,
  uid: string,
  candidates: AiVocabCandidate[],
): Promise<number> {
  requireUid(uid);
  await requireOwnedSet(uid, setId);
  const selected = candidates.filter((c) => c.selected !== false);
  return saveCandidates(setId, selected, "AI", "Gemini + Dictionary", 50);
}

/* ------------------------------------------------------------------ */
/*  Public: Community                                                  */
/* ------------------------------------------------------------------ */

export async function copyCommunityFolder(
  uid: string,
  folderId: number,
): Promise<{ id: number }> {
  requireUid(uid);
  const folders = await liveFolders();
  const sourceFolder = folders.find(
    (f) => f.id === folderId && f.publicShared,
  );
  if (!sourceFolder) throw NotFound("Community folder not found");

  const folderName = await uniqueFolderName(uid, sourceFolder.name);
  const newFolder = await createMyFolder(uid, folderName);

  const sets = await publishedSets();
  const folderSets = sets.filter((s) => s.folderId === folderId);
  for (const set of folderSets) {
    await copySetAsNew(uid, set, newFolder.id);
  }

  return newFolder;
}

export async function copyCommunitySet(
  uid: string,
  sourceSetId: number,
  targetSetId?: number | null,
): Promise<number> {
  requireUid(uid);
  const sets = await publishedSets();
  const sourceSet = sets.find((s) => s.id === sourceSetId);
  if (!sourceSet) throw NotFound("Source set not found");

  if (targetSetId) {
    await requireOwnedSet(uid, targetSetId);
    return copyWords(sourceSetId, targetSetId);
  } else {
    await copySetAsNew(uid, sourceSet, null);
    const words = await wordsForSet(sourceSetId);
    return words.length;
  }
}

/* ------------------------------------------------------------------ */
/*  Public: Review (SM-2)                                              */
/* ------------------------------------------------------------------ */

export async function review(
  uid: string,
  wordId: number,
  quality: number,
): Promise<VocabReviewResponse> {
  requireUid(uid);
  if (quality < 0 || quality > 5) throw BadRequest("Quality must be 0-5");

  const word = (await wordsByIds([wordId])).get(wordId);
  if (!word || word.status !== "PUBLISHED" || word.deletedAtMillis) {
    throw NotFound("Word not found");
  }

  let progress = await findProgress(uid, wordId);
  if (!progress) {
    progress = {
      uid,
      wordId,
      setId: word.setId,
      status: "NEW",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
    };
  }

  const updated = applySm2(progress, quality);
  await saveProgress(updated);
  await recordStudyActivity(uid, {
    module: "vocab",
    activityType: "vocab_review",
    metric: "vocab",
    quantity: 1,
    sourceId: wordId,
    occurredAtMillis: updated.lastReviewedAtMillis,
  }).catch(() => undefined);

  return {
    wordId,
    newStatus: updated.status,
    nextReviewAtMillis: updated.nextReviewAtMillis,
  };
}

export type VocabBatchReviewInput = {
  wordId: number;
  quality?: number;
  mastered?: boolean;
};

/**
 * Saves a completed vocabulary game in one Firestore transaction. Individual
 * review requests all update the same user summary document, so sending them
 * in parallel causes transaction contention and long retry delays.
 */
export async function reviewBatch(
  uid: string,
  reviews: VocabBatchReviewInput[],
  requestId?: string,
): Promise<VocabReviewResponse[]> {
  requireUid(uid);
  if (requestId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    throw BadRequest("Review request ID is invalid");
  }
  const uniqueReviews = new Map<number, VocabBatchReviewInput>();
  for (const reviewInput of reviews) {
    const wordId = Math.trunc(reviewInput.wordId);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      throw BadRequest("Word ID is invalid");
    }
    const mastered = reviewInput.mastered === true;
    const quality = reviewInput.quality;
    if (!mastered && (typeof quality !== "number" || quality < 0 || quality > 5)) {
      throw BadRequest("Quality must be 0-5");
    }
    uniqueReviews.set(wordId, { wordId, mastered, quality });
  }
  const requested = [...uniqueReviews.values()];
  if (!requested.length) return [];
  if (requested.length > 100) throw BadRequest("Too many words in one review session");

  const now = Date.now();
  const userRef = adminDb.collection("users").doc(uid);
  const requestRef = requestId ? userRef.collection("vocabReviewRequests").doc(requestId) : null;
  const fingerprint = requestRef
    ? createHash("sha256").update(JSON.stringify(requested)).digest("hex")
    : null;
  const progressRefs = requested.map((reviewInput) =>
    userRef.collection(PROGRESS).doc(String(reviewInput.wordId)));
  const activityRef = studyActivityDayRef(uid, now);
  let wordsLookup: Promise<Map<number, VocabWordDoc>> | undefined;

  const result = await adminDb.runTransaction(async (tx) => {
    if (requestRef) {
      const requestSnap = await tx.get(requestRef);
      if (requestSnap.exists) {
        const saved = requestSnap.data()!;
        if (saved.fingerprint !== fingerprint) throw BadRequest("Review request ID has already been used for different reviews");
        return saved.responses as VocabReviewResponse[];
      }
    }
    const wordsById = await (wordsLookup ??= wordsByIds(requested.map((reviewInput) => reviewInput.wordId)));
    for (const reviewInput of requested) {
      if (!wordsById.has(reviewInput.wordId)) throw NotFound("Word not found");
    }
    const [userSnap, activitySnap, ...progressSnaps] = await tx.getAll(userRef, activityRef, ...progressRefs);
    const userData = userSnap.data() ?? {};
    const nextProgressItems: VocabProgressDoc[] = [];
    let masteredDelta = 0;
    let dueDelta = 0;

    const responses = requested.map((reviewInput, index) => {
      const word = wordsById.get(reviewInput.wordId);
      if (!word) throw NotFound("Word not found");
      const previousSnap = progressSnaps[index];
      const previous = previousSnap.exists ? toProgressDoc(previousSnap) : null;
      const baseProgress = previous ?? {
        uid,
        wordId: word.id,
        setId: word.setId,
        status: "NEW" as const,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
      };
      const updated = reviewInput.mastered
        ? masteredProgress(baseProgress, now)
        : applySm2(baseProgress, reviewInput.quality ?? 0, now);

      masteredDelta += Number(updated.status === "MASTERED") - Number(previous?.status === "MASTERED");
      dueDelta += Number(isDueProgress(updated, now)) - Number(previous ? isDueProgress(previous, now) : false);
      nextProgressItems.push(updated);
      tx.set(progressRefs[index], progressPayload(updated), { merge: true });
      return {
        wordId: updated.wordId,
        newStatus: updated.status,
        nextReviewAtMillis: updated.nextReviewAtMillis,
      } satisfies VocabReviewResponse;
    });

    writeProgressSummary(tx, userRef, userData, {
      masteredDelta,
      dueDelta,
      nextDueAtMillis: nextSummaryDueAtMillis(userData, nextProgressItems),
      now,
    });
    writeStudyActivityInTransaction(tx, uid, {
      module: "vocab", activityType: "vocab_review_batch", metric: "vocab",
      quantity: requested.length, occurredAtMillis: now,
    }, activitySnap, userData);
    if (requestRef) {
      tx.set(requestRef, {
        fingerprint,
        responses,
        createdAtMillis: now,
        // Timestamp is ready for an optional Firestore TTL policy; until then
        // keep the marker so even a late retry cannot apply SM-2 twice.
        expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
      });
    }
    return responses;
  });
  invalidateLearnerActivityCaches(uid);
  return result;
}

/* ------------------------------------------------------------------ */
/*  SM-2 Algorithm                                                     */
/* ------------------------------------------------------------------ */

function applySm2(
  progress: VocabProgressDoc,
  quality: number,
  now = Date.now(),
): VocabProgressDoc {
  let { easeFactor, interval, repetitions } = progress;
  let status: VocabProgressStatus;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions++;
    easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    if (quality >= 4 && repetitions >= 3) {
      status = "MASTERED";
    } else {
      status = "REVIEWING";
    }
  } else {
    repetitions = 0;
    interval = 1;
    status = "LEARNING";
  }

  const nextReviewAtMillis = now + interval * 24 * 60 * 60 * 1000;

  return {
    ...progress,
    status,
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    nextReviewAtMillis,
    lastReviewedAtMillis: now,
  };
}

function masteredProgress(
  progress: VocabProgressDoc,
  now: number,
): VocabProgressDoc {
  const interval = Math.max(30, progress.interval || 0);
  return {
    ...progress,
    status: "MASTERED",
    interval,
    easeFactor: progress.easeFactor || 2.5,
    repetitions: Math.max(3, progress.repetitions || 0),
    nextReviewAtMillis: now + interval * 24 * 60 * 60 * 1000,
    lastReviewedAtMillis: now,
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

async function saveCandidates(
  setId: number,
  candidates: AiVocabCandidate[],
  sourceType: SourceType,
  sourceNote: string | null,
  limit: number,
): Promise<number> {
  const existingWords = await wordKeysForSet(setId);
  const existingSet = new Set(existingWords);

  const normalizedCandidates = await mapWithConcurrency(
    candidates.slice(0, limit),
    8,
    async (candidate) => sourceType === "AI"
      ? normalizeCandidateWithoutLookup(candidate)
      : normalizeCandidateForSave(candidate),
  );
  const accepted: AiVocabCandidate[] = [];
  for (const normalizedCandidate of normalizedCandidates) {
    const normalized = normalizedCandidate.word.toLowerCase().trim();
    if (!normalized || existingSet.has(normalized)) continue;

    accepted.push(normalizedCandidate);
    existingSet.add(normalized);
  }

  const wordIds = await newNumericIds(WORDS, accepted.length);
  const now = Date.now();
  const writes: Array<{ id: number; data: Record<string, unknown> }> = [];
  for (const [index, normalizedCandidate] of accepted.entries()) {
    const wordId = wordIds[index]!;

    writes.push({
      id: wordId,
      data: {
        id: wordId,
        setId,
        word: normalizedCandidate.word,
        meaning: normalizedCandidate.meaning?.trim() || "",
        partOfSpeech: normalizedCandidate.partOfSpeech || "OTHER",
        phonetic: normalizedCandidate.phonetic || null,
        phoneticUs: normalizedCandidate.phoneticUs || null,
        phoneticUk: normalizedCandidate.phoneticUk || null,
        example: normalizedCandidate.example || null,
        audioUrl: normalizedCandidate.audioUrl || null,
        audioUsUrl: normalizedCandidate.audioUsUrl || null,
        audioUkUrl: normalizedCandidate.audioUkUrl || null,
        status: "PUBLISHED" satisfies ContentStatus,
        sourceType,
        sourceNote,
        publishedAtMillis: now,
        updatedAtMillis: now,
      },
    });
  }

  await commitWordWrites(writes);

  if (writes.length > 0) {
    await adminDb.collection(SETS).doc(String(setId)).update({
      wordCount: existingWords.length + writes.length,
      updatedAtMillis: Date.now(),
    });
  }

  return writes.length;
}

async function copySetAsNew(
  uid: string,
  sourceSet: VocabSetDoc,
  folderId: number | null,
): Promise<{ id: number }> {
  const id = await newNumericId(SETS);
  const now = Date.now();
  const data: Record<string, unknown> = {
    id,
    ownerUid: uid,
    title: sourceSet.title,
    topic: sourceSet.topic,
    description: sourceSet.description ?? null,
    icon: sourceSet.icon ?? null,
    level: sourceSet.level ?? null,
    status: "PUBLISHED" satisfies ContentStatus,
    sourceType: "COMMUNITY" satisfies SourceType,
    wordCount: 0,
    sourceNote: `Copied from set #${sourceSet.id}`,
    publishedAtMillis: now,
    updatedAtMillis: now,
  };
  if (folderId) {
    data.folderId = folderId;
  }
  await adminDb.collection(SETS).doc(String(id)).set(data);
  await copyWords(sourceSet.id, id);
  return { id };
}

/** Explicit list-page action. Unlike an SM-2 review, this means the learner
 * deliberately marks the word as mastered immediately. */
export async function markMastered(
  uid: string,
  wordId: number,
): Promise<VocabReviewResponse> {
  requireUid(uid);
  const word = (await wordsByIds([wordId])).get(wordId);
  if (!word || word.status !== "PUBLISHED" || word.deletedAtMillis) {
    throw NotFound("Word not found");
  }
  const previous = await findProgress(uid, wordId);
  const now = Date.now();
  const interval = Math.max(30, previous?.interval ?? 0);
  const updated: VocabProgressDoc = {
    uid,
    wordId,
    setId: word.setId,
    status: "MASTERED",
    interval,
    easeFactor: previous?.easeFactor ?? 2.5,
    repetitions: Math.max(3, previous?.repetitions ?? 0),
    nextReviewAtMillis: now + interval * 24 * 60 * 60 * 1000,
    lastReviewedAtMillis: now,
  };
  await saveProgress(updated);
  await recordStudyActivity(uid, {
    module: "vocab",
    activityType: "vocab_mastered",
    metric: "vocab",
    quantity: 1,
    sourceId: wordId,
    occurredAtMillis: now,
  }).catch(() => undefined);
  return {
    wordId,
    newStatus: updated.status,
    nextReviewAtMillis: updated.nextReviewAtMillis,
  };
}

async function normalizeCandidateForSave(
  candidate: AiVocabCandidate,
): Promise<AiVocabCandidate> {
  const baseCandidate = normalizeCandidateWithoutLookup(candidate);

  if (
    baseCandidate.audioUrl ||
    baseCandidate.audioUsUrl ||
    baseCandidate.audioUkUrl ||
    baseCandidate.phoneticUs ||
    baseCandidate.phoneticUk
  ) {
    return baseCandidate;
  }

  return enrichCandidatePronunciation(baseCandidate);
}

function normalizeCandidateWithoutLookup(
  candidate: AiVocabCandidate,
): AiVocabCandidate {
  const wordInfo = extractWordAndPartOfSpeech(candidate.word);
  const baseCandidate: AiVocabCandidate = {
    ...candidate,
    word: wordInfo.word,
    partOfSpeech:
      candidate.partOfSpeech && candidate.partOfSpeech !== "OTHER"
        ? candidate.partOfSpeech
        : wordInfo.partOfSpeech ?? candidate.partOfSpeech ?? "OTHER",
  };
  return baseCandidate;
}

function extractWordAndPartOfSpeech(value: string): {
  word: string;
  partOfSpeech?: string;
} {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const match = trimmed.match(
    /\s*\((n|noun|v|verb|adj|adjective|adv|adverb)\)\s*$/i,
  );
  if (!match) return { word: trimmed };

  return {
    word: trimmed.slice(0, match.index).trim(),
    partOfSpeech: normalizePartOfSpeechMarker(match[1]),
  };
}

function normalizePartOfSpeechMarker(value: string): string {
  switch (value.toLowerCase()) {
    case "n":
    case "noun":
      return "NOUN";
    case "v":
    case "verb":
      return "VERB";
    case "adj":
    case "adjective":
      return "ADJ";
    case "adv":
    case "adverb":
      return "ADV";
    default:
      return "OTHER";
  }
}

async function copyWords(
  sourceSetId: number,
  targetSetId: number,
): Promise<number> {
  const sourceWords = await wordsForSet(sourceSetId);
  const existingWords = (await wordsForSet(targetSetId)).map((w) =>
    w.word.toLowerCase().trim(),
  );
  const existingSet = new Set(existingWords);

  const writes: Array<{ id: number; data: Record<string, unknown> }> = [];
  for (const word of sourceWords) {
    const normalized = word.word.toLowerCase().trim();
    if (existingSet.has(normalized)) continue;

    const wordId = await newNumericId(WORDS);
    const now = Date.now();
    writes.push({
      id: wordId,
      data: {
        id: wordId,
        setId: targetSetId,
        word: word.word,
        meaning: word.meaning,
        partOfSpeech: word.partOfSpeech ?? "OTHER",
        phonetic: word.phonetic ?? null,
        phoneticUs: word.phoneticUs ?? null,
        phoneticUk: word.phoneticUk ?? null,
        example: word.example ?? null,
        audioUrl: word.audioUrl ?? null,
        audioUsUrl: word.audioUsUrl ?? null,
        audioUkUrl: word.audioUkUrl ?? null,
        status: "PUBLISHED" satisfies ContentStatus,
        sourceType: "COMMUNITY" satisfies SourceType,
        publishedAtMillis: now,
        updatedAtMillis: now,
      },
    });
    existingSet.add(normalized);
  }
  await commitWordWrites(writes);
  if (writes.length > 0) {
    await adminDb.collection(SETS).doc(String(targetSetId)).update({
      wordCount: existingWords.length + writes.length,
      updatedAtMillis: Date.now(),
    });
  }
  return writes.length;
}

async function newNumericId(collection: string): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomInt(1_000_000_000, 281_474_976_710_655);
    const snap = await adminDb.collection(collection).doc(String(id)).get();
    if (!snap.exists) return id;
  }
  throw new Error(`Could not allocate id for ${collection}`);
}

async function commitWordWrites(
  writes: Array<{ id: number; data: Record<string, unknown> }>,
): Promise<void> {
  for (let index = 0; index < writes.length; index += 450) {
    const batch = adminDb.batch();
    for (const write of writes.slice(index, index + 450)) {
      batch.set(adminDb.collection(WORDS).doc(String(write.id)), write.data);
    }
    await batch.commit();
  }
}

async function uniqueFolderName(
  uid: string,
  sourceName: string,
): Promise<string> {
  const folders = await findMyFolderCards(uid);
  const existing = new Set(folders.map((f) => f.name.toLowerCase()));
  let name = sourceName;
  let counter = 1;
  while (existing.has(name.toLowerCase())) {
    counter++;
    name = `${sourceName} (${counter})`;
  }
  return name;
}

async function requireOwnedSet(
  uid: string,
  setId: number,
): Promise<VocabSetDoc> {
  const doc = await adminDb.collection(SETS).doc(String(setId)).get();
  if (!doc.exists) throw NotFound("Set not found");
  const set = toSetDoc(doc);
  if (set.ownerUid !== uid) throw Forbidden("Not authorized");
  return set;
}

async function requireOwnedFolder(
  uid: string,
  folderId: number,
): Promise<VocabFolderDoc> {
  const doc = await adminDb
    .collection(FOLDERS)
    .doc(String(folderId))
    .get();
  if (!doc.exists) throw NotFound("Folder not found");
  const folder = toFolderDoc(doc);
  if (folder.ownerUid !== uid) throw Forbidden("Not authorized");
  return folder;
}

function excludeExistingWords(
  suggestedWords: string[],
  existingWords: string[],
  limit: number,
): string[] {
  const existingSet = new Set(existingWords.map((w) => w.toLowerCase()));
  return suggestedWords
    .filter((w) => !existingSet.has(w.toLowerCase()))
    .slice(0, limit);
}

function orderWordsForReview(
  words: VocabWordDoc[],
  progressByWordId: Map<number, VocabProgressDoc>,
  now: number,
): VocabWordDoc[] {
  return [...words].sort((left, right) => {
    const leftProgress = progressByWordId.get(left.id);
    const rightProgress = progressByWordId.get(right.id);
    const dueDifference = Number(rightProgress != null && isDueProgress(rightProgress, now))
      - Number(leftProgress != null && isDueProgress(leftProgress, now));
    const leftReviewed = leftProgress?.lastReviewedAtMillis ?? Number.NEGATIVE_INFINITY;
    const rightReviewed = rightProgress?.lastReviewedAtMillis ?? Number.NEGATIVE_INFINITY;
    return dueDifference || (leftReviewed === rightReviewed ? 0 : leftReviewed - rightReviewed);
  });
}

function matchesMastery(
  word: VocabWordDoc,
  progressByWordId: Map<number, VocabProgressDoc>,
  mastery: string,
  now: number,
): boolean {
  const prog = progressByWordId.get(word.id);
  switch (mastery) {
    case "mastered":
      return prog?.status === "MASTERED";
    case "due":
      return (
        prog != null &&
        prog.status !== "NEW" &&
        prog.nextReviewAtMillis != null &&
        prog.nextReviewAtMillis <= now
      );
    case "learning":
    default:
      return !prog || prog.status !== "MASTERED";
  }
}

/**
 * Reserve a group of random numeric IDs with one Firestore read batch.
 * Individual collision checks made a 50-word AI save wait for 50 sequential
 * network round trips; collisions in this 48-bit range are exceptionally rare.
 */
async function newNumericIds(collection: string, count: number): Promise<number[]> {
  if (count <= 0) return [];
  const proposals = new Set<number>();
  while (proposals.size < count) {
    proposals.add(randomInt(1_000_000_000, 281_474_976_710_655));
  }
  const ids = [...proposals];
  const snapshots = await adminDb.getAll(
    ...ids.map((id) => adminDb.collection(collection).doc(String(id))),
  );
  const available = snapshots.filter((snapshot) => !snapshot.exists).map((snapshot) => Number(snapshot.id));
  if (available.length === count) return available;
  return [...available, ...(await newNumericIds(collection, count - available.length))];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function isDueProgress(progress: VocabProgressDoc, now: number): boolean {
  return (
    progress.status !== "NEW" &&
    progress.nextReviewAtMillis != null &&
    progress.nextReviewAtMillis <= now
  );
}

function folderCounts(sets: VocabSetDoc[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const set of sets) {
    if (set.folderId == null) continue;
    counts.set(set.folderId, (counts.get(set.folderId) ?? 0) + 1);
  }
  return counts;
}

function normalizeMastery(mastery: string): string {
  switch (mastery) {
    case "all":
    case "mastered":
    case "due":
      return mastery;
    default:
      return "learning";
  }
}

function parseAmount(amount: string, total: number): number {
  if (amount === "all") return total;
  const parsed = parseInt(amount, 10);
  return isNaN(parsed) || parsed <= 0 ? 20 : Math.min(parsed, total);
}

function normalizeIcon(icon?: string): string {
  if (!icon) return "📚";
  const trimmed = icon.trim();
  return trimmed || "📚";
}

function requireUid(uid: string | null): asserts uid is string {
  if (!uid) throw Unauthorized("Authentication required");
}

/* ------------------------------------------------------------------ */
/*  Document mapping                                                   */
/* ------------------------------------------------------------------ */

function toSetDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
): VocabSetDoc {
  const d = doc.data() ?? {};
  return {
    id: numVal(d, "id") ?? parseInt(doc.id, 10),
    wordCount: numVal(d, "wordCount"),
    ownerUid: strVal(d, "ownerUid"),
    ownerName: strVal(d, "ownerName"),
    folderId: numVal(d, "folderId"),
    folderName: strVal(d, "folderName"),
    folderPublicShared: boolVal(d, "folderPublicShared"),
    title: strVal(d, "title") || "Vocabulary set",
    topic: strVal(d, "topic") || "Vocabulary",
    description: strVal(d, "description"),
    icon: strVal(d, "icon"),
    level: strVal(d, "level"),
    status: (strVal(d, "status") as ContentStatus) || "PUBLISHED",
    sourceType: (strVal(d, "sourceType") as SourceType) || "MANUAL",
    sourceNote: strVal(d, "sourceNote"),
    licenseNote: strVal(d, "licenseNote"),
    externalSource: strVal(d, "externalSource"),
    externalSetId: strVal(d, "externalSetId"),
    externalTestId: strVal(d, "externalTestId"),
    externalAccessLevel: strVal(d, "externalAccessLevel"),
    externalPartCount: numVal(d, "externalPartCount"),
    publishedAtMillis: numVal(d, "publishedAtMillis"),
    updatedAtMillis: numVal(d, "updatedAtMillis"),
    deletedAtMillis: numVal(d, "deletedAtMillis"),
  };
}

function toWordDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
): VocabWordDoc {
  const d = doc.data() ?? {};
  return {
    ...vocabularyDetails(d),
    id: numVal(d, "id") ?? parseInt(doc.id, 10),
    setId: numVal(d, "setId") ?? 0,
    word: strVal(d, "word") || "",
    meaning: strVal(d, "meaning") || "",
    partOfSpeech: strVal(d, "partOfSpeech"),
    phonetic: strVal(d, "phonetic"),
    phoneticUs: strVal(d, "phoneticUs"),
    phoneticUk: strVal(d, "phoneticUk"),
    example: strVal(d, "example"),
    audioUrl: strVal(d, "audioUrl"),
    audioUsUrl: strVal(d, "audioUsUrl"),
    audioUkUrl: strVal(d, "audioUkUrl"),
    status: (strVal(d, "status") as ContentStatus) || "PUBLISHED",
    sourceType: (strVal(d, "sourceType") as SourceType) || "MANUAL",
    sourceNote: strVal(d, "sourceNote"),
    licenseNote: strVal(d, "licenseNote"),
    externalSource: strVal(d, "externalSource"),
    externalWordId: strVal(d, "externalWordId"),
    externalPartId: strVal(d, "externalPartId"),
    externalPartName: strVal(d, "externalPartName"),
    externalOrderIndex: numVal(d, "externalOrderIndex"),
    toeicPart: numVal(d, "toeicPart"),
    difficultyLevel: numVal(d, "difficultyLevel"),
    publishedAtMillis: numVal(d, "publishedAtMillis"),
    updatedAtMillis: numVal(d, "updatedAtMillis"),
    deletedAtMillis: numVal(d, "deletedAtMillis"),
  };
}

function toFolderDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
): VocabFolderDoc {
  const d = doc.data() ?? {};
  return {
    id: numVal(d, "id") ?? parseInt(doc.id, 10),
    ownerUid: strVal(d, "ownerUid"),
    ownerName: strVal(d, "ownerName"),
    name: strVal(d, "name") || "Folder",
    publicShared: boolVal(d, "publicShared") ?? false,
    sharedAtMillis: numVal(d, "sharedAtMillis"),
    createdAtMillis: numVal(d, "createdAtMillis"),
    updatedAtMillis: numVal(d, "updatedAtMillis"),
    deletedAtMillis: numVal(d, "deletedAtMillis"),
  };
}

function toProgressDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
): VocabProgressDoc {
  const d = doc.data() ?? {};
  return {
    uid: strVal(d, "uid") || "",
    wordId: numVal(d, "wordId") ?? parseInt(doc.id, 10),
    setId: numVal(d, "setId") ?? 0,
    status: (strVal(d, "status") as VocabProgressStatus) || "NEW",
    interval: numVal(d, "interval") ?? 0,
    easeFactor: numericVal(d, "easeFactor") ?? 2.5,
    repetitions: numVal(d, "repetitions") ?? 0,
    nextReviewAtMillis: numVal(d, "nextReviewAtMillis"),
    lastReviewedAtMillis: numVal(d, "lastReviewedAtMillis"),
  };
}

function toWordCard(word: VocabWordDoc, mastered: boolean): VocabWordCard {
  return {
    ...vocabularyDetails(word as unknown as Record<string, unknown>),
    id: word.id,
    word: word.word,
    meaning: word.meaning,
    partOfSpeech: word.partOfSpeech,
    phonetic: word.phonetic,
    phoneticUs: word.phoneticUs,
    phoneticUk: word.phoneticUk,
    example: word.example,
    audioUrl: word.audioUrl,
    audioUsUrl: word.audioUsUrl,
    audioUkUrl: word.audioUkUrl,
    externalPartId: word.externalPartId,
    externalPartName: word.externalPartName,
    mastered,
  };
}

function toStudyHistoryDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
): VocabStudyHistoryDoc {
  const d = doc.data() ?? {};
  const id = strVal(d, "id") || doc.id;
  return {
    id,
    uid: strVal(d, "uid") || "",
    source: (strVal(d, "source") as "DAUTOEIC" | "LOCAL") || "LOCAL",
    setId: numVal(d, "setId") ?? 0,
    externalTestId: strVal(d, "externalTestId"),
    externalPartId: strVal(d, "externalPartId"),
    title: strVal(d, "title") || "Vocabulary session",
    mode: strVal(d, "mode") || "Practice",
    startedAtMillis: numVal(d, "startedAtMillis") ?? 0,
    finishedAtMillis: numVal(d, "finishedAtMillis") ?? 0,
    totalWords: numVal(d, "totalWords") ?? 0,
    correctWords: numVal(d, "correctWords") ?? 0,
    wrongWords: numVal(d, "wrongWords") ?? 0,
    accuracy: numVal(d, "accuracy") ?? 0,
    score: numVal(d, "score") ?? 0,
  };
}

function toStudyHistoryCard(entry: VocabStudyHistoryDoc): VocabStudyHistoryCard {
  return {
    id: entry.id,
    mode: entry.mode,
    time: new Date(entry.finishedAtMillis || Date.now()).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    accuracy: entry.accuracy,
    score: entry.score,
    totalWords: entry.totalWords,
    correctWords: entry.correctWords,
    wrongWords: entry.wrongWords,
  };
}

/* ------------------------------------------------------------------ */
/*  Primitive helpers                                                  */
/* ------------------------------------------------------------------ */

function strVal(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = data[key];
  if (v == null) return undefined;
  return String(v);
}

function numVal(
  data: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = data[key];
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return isNaN(parsed) ? undefined : parsed;
}

function numericVal(
  data: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = data[key];
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? undefined : parsed;
}

function boolVal(data: Record<string, unknown>, key: string): boolean {
  const v = data[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

export function vocabDayStartForMillis(millis: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(millis));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dayKey = `${value("year")}-${value("month")}-${value("day")}`;
  const localMidnight = Date.parse(`${dayKey}T00:00:00+07:00`);
  return Number.isFinite(localMidnight) ? localMidnight : millis;
}

function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
