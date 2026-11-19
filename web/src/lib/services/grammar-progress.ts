import { adminDb } from "@/lib/firestore/db";
import type { GrammarAnswers } from "@/lib/grammar-learning";

export function extractGrammarTopicAnswers(
  data: Record<string, unknown> | undefined,
): GrammarAnswers {
  if (!data) return {};
  const result: GrammarAnswers = {};
  const nested = data.answers;
  if (nested && typeof nested === "object") {
    for (const [key, val] of Object.entries(nested as Record<string, unknown>)) {
      if (typeof val === "string" && /^[A-D]$/.test(val)) {
        result[key] = val as "A" | "B" | "C" | "D";
      }
    }
  }
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith("answers.") && typeof val === "string" && /^[A-D]$/.test(val)) {
      const qId = key.slice("answers.".length);
      if (qId) result[qId] = val as "A" | "B" | "C" | "D";
    }
  }
  return result;
}

export async function loadUserGrammarProgress(
  uid: string | null | undefined,
): Promise<Record<string, GrammarAnswers>> {
  if (!uid) return {};
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("grammarProgress")
      .limit(50)
      .get();
    const topics: Record<string, GrammarAnswers> = {};
    for (const doc of snap.docs) {
      topics[doc.id] = extractGrammarTopicAnswers(doc.data());
    }
    return topics;
  } catch {
    return {};
  }
}

export async function loadUserGrammarTopicProgress(
  uid: string | null | undefined,
  topicId: string | null | undefined,
): Promise<GrammarAnswers> {
  if (!uid || !topicId) return {};
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("grammarProgress")
      .doc(topicId)
      .get();
    return snap.exists ? extractGrammarTopicAnswers(snap.data()) : {};
  } catch {
    return {};
  }
}
