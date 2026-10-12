import { adminDb } from "@/lib/firestore/db";
import { randomUUID } from "node:crypto";
import { getTestPartSession } from "./test-part-practice";
import { getDifficultySession, getReadingDifficultySession } from "./dautoeic";
import type { DauToeicDifficultySession } from "@/types/dautoeic";

export type Mistake = { questionId: string; itemId: string; part: number; level: number; testId?: string; wrongCount: number; lastAttempt: number };
export type MistakeGroup = { key: string; skill: "reading" | "listening"; label: string; count: number; href: string; mistakes: Mistake[] };

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

export async function getMistakeGroups(uid: string, skill: "reading" | "listening") {
  // Query only unresolved errors, with a bounded read cost per dashboard visit.
  const snapshot = await adminDb.collection("users").doc(uid).collection(`${skill}Progress`).where("correct", "==", false).limit(201).get();
  const rows = snapshot.docs.slice(0, 200).flatMap((doc): Mistake[] => {
    const data = doc.data();
    const part = Number(data.part);
    if (!Number.isInteger(part) || (skill === "reading" ? part < 5 || part > 7 : part < 1 || part > 4) || typeof data.itemId !== "string") return [];
    return [{ questionId: doc.id, itemId: data.itemId, part, level: Math.max(1, Math.min(4, Number(data.level) || 1)),
      testId: typeof data.testId === "string" && data.testId ? data.testId : undefined,
      wrongCount: Math.max(1, Number(data.wrongCount) || 1), lastAttempt: Number(data.completedAtMillis) || 0 }];
  });
  return { groups: groupMistakes(rows, skill, randomUUID()), hasMore: snapshot.size > 200 };
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
  const { groups } = await getMistakeGroups(uid, skill);
  const mistakes = groups.find((group) => group.key === `${part}:${testId ?? `level-${level}`}`)?.mistakes ?? [];
  if (!mistakes.length) return null;
  const session = testId ? await getTestPartSession(testId, part)
    : skill === "reading" ? await getReadingDifficultySession(part, level, null) : await getDifficultySession(part, level, null);
  return session ? selectMistakeSession(session, mistakes) : null;
}
