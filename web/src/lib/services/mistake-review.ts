import { adminDb } from "@/lib/firestore/db";
import { FieldPath } from "firebase-admin/firestore";
import { ApiError } from "../api/response";
import { randomUUID } from "node:crypto";
import { getTestPartSession } from "./test-part-practice";
import { getDifficultySession, getReadingDifficultySession } from "./dautoeic";
import type { DauToeicDifficultySession } from "@/types/dautoeic";

export type Mistake = { questionId: string; itemId: string; part: number; level: number; testId?: string; wrongCount: number; lastAttempt: number };
export type MistakeGroup = { key: string; skill: "reading" | "listening"; label: string; count: number; href: string; mistakes: Mistake[] };
export type MistakePage = { groups: MistakeGroup[]; hasMore: boolean; nextCursor?: string };
const PAGE_SIZE = 60;

export function groupMistakes(rows: Mistake[], skill: "reading" | "listening", run: string): MistakeGroup[] {
  const groups = new Map<string, MistakeGroup>();
  for (const row of [...rows].sort((a, b) => b.wrongCount - a.wrongCount || a.lastAttempt - b.lastAttempt)) {
    const key = `${row.part}:${row.testId ?? `level-${row.level}`}`;
    let group = groups.get(key);
    if (!group) {
      const params = new URLSearchParams({ skill, part: String(row.part), level: String(row.level), run });
      if (row.testId) params.set("testId", row.testId);
      group = { key, skill, label: `Part ${row.part} · ${row.testId ? `Đề ${row.testId}` : `Mức ${row.level}`}`, count: 0, href: `/review/practice?${params}`, mistakes: [] };
      groups.set(key, group);
    }
    group.mistakes.push(row); group.count++;
  }
  return [...groups.values()];
}

export async function getMistakeGroups(uid: string, skill: "reading" | "listening", cursor?: string): Promise<MistakePage> {
  // Read a small, deterministic page. This keeps the review dashboard fast as
  // a learner's history grows; the composite index is shared by both skills.
  const collection = adminDb.collection("users").doc(uid).collection(`${skill}Progress`);
  let query = collection.where("correct", "==", false).orderBy("wrongCount", "desc").orderBy("completedAtMillis", "asc").orderBy(FieldPath.documentId()).limit(PAGE_SIZE + 1);
  if (cursor) {
    try {
      if (cursor.length > 1024) throw new Error("cursor");
      const [wrongCount, time, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (!Number.isFinite(wrongCount) || !Number.isFinite(time) || typeof id !== "string" || !id || id.length > 256 || id.includes("/")) throw new Error("cursor");
      query = query.startAfter(wrongCount, time, id);
    } catch { throw new ApiError("Trang ôn không hợp lệ. Hãy tải lại danh sách.", 400); }
  }
  const snapshot = await query.get();
  const pageDocs = snapshot.docs.slice(0, PAGE_SIZE);
  const rows = pageDocs.flatMap((doc): Mistake[] => {
    const data = doc.data();
    const part = Number(data.part);
    if (!Number.isInteger(part) || (skill === "reading" ? part < 5 || part > 7 : part < 1 || part > 4) || typeof data.itemId !== "string") return [];
    return [{ questionId: doc.id, itemId: data.itemId, part, level: Math.max(1, Math.min(4, Number(data.level) || 1)),
      testId: typeof data.testId === "string" && data.testId ? data.testId : undefined,
      wrongCount: Math.max(1, Number(data.wrongCount) || 1), lastAttempt: Number(data.completedAtMillis) || 0 }];
  });
  return {
    groups: groupMistakes(rows, skill, randomUUID()),
    hasMore: snapshot.size > PAGE_SIZE,
    nextCursor: snapshot.size > PAGE_SIZE ? Buffer.from(JSON.stringify([pageDocs.at(-1)!.data().wrongCount ?? 1, pageDocs.at(-1)!.data().completedAtMillis ?? 0, pageDocs.at(-1)!.id])).toString("base64url") : undefined,
  };
}

async function getMistakesForGroup(uid: string, skill: "reading" | "listening", part: number, level: number, testId?: string): Promise<Mistake[]> {
  const collection = adminDb.collection("users").doc(uid).collection(`${skill}Progress`);
  let query = collection.where("correct", "==", false).where("part", "==", part);
  query = testId ? query.where("testId", "==", testId) : query.where("level", "==", level);
  const snapshot = await query.orderBy("completedAtMillis", "asc").orderBy(FieldPath.documentId()).limit(200).get();
  return snapshot.docs.flatMap((doc): Mistake[] => {
    const data = doc.data();
    const rowTestId = typeof data.testId === "string" && data.testId ? data.testId : undefined;
    const rowLevel = Math.max(1, Math.min(4, Number(data.level) || 1));
    if (rowTestId !== testId || (!testId && rowLevel !== level) || typeof data.itemId !== "string") return [];
    return [{ questionId: doc.id, itemId: data.itemId, part, level: rowLevel, testId: rowTestId,
      wrongCount: Math.max(1, Number(data.wrongCount) || 1), lastAttempt: Number(data.completedAtMillis) || 0 }];
  });
}

export function selectMistakeSession(session: DauToeicDifficultySession, mistakes: Mistake[]): DauToeicDifficultySession {
  const rank = new Map(mistakes.map((mistake, index) => [mistake.questionId, index]));
  const items = session.items.flatMap((item) => {
    const questions = item.questions.filter((question) => rank.has(question.id));
    return questions.length ? [{ ...item, questions }] : [];
  }).sort((a, b) => Math.min(...a.questions.map((q) => rank.get(q.id)!)) - Math.min(...b.questions.map((q) => rank.get(q.id)!)));
  return { ...session, items, total: items.length };
}

export async function getMistakeSession(uid: string, skill: "reading" | "listening", part: number, level: number, testId?: string) {
  const mistakes = (await getMistakesForGroup(uid, skill, part, level, testId)).sort((a, b) => b.wrongCount - a.wrongCount || a.lastAttempt - b.lastAttempt);
  if (!mistakes.length) return null;
  const session = testId ? await getTestPartSession(testId, part)
    : skill === "reading" ? await getReadingDifficultySession(part, level, null) : await getDifficultySession(part, level, null);
  return session ? selectMistakeSession(session, mistakes) : null;
}
