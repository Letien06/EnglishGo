import { NextRequest } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firestore/db";
import type { GrammarAnswers } from "@/lib/grammar-learning";
import { extractGrammarTopicAnswers } from "@/lib/services/grammar-progress";
import { recordStudyActivity } from "@/lib/services/study-activity";

interface GrammarProgressResponse {
  authenticated: boolean;
  topicId?: string;
  answers?: GrammarAnswers;
  topics?: Record<string, GrammarAnswers>;
}

const grammarProgressSchema = z.object({
  topicId: z.string().trim().min(1).max(120),
  questionId: z.string().trim().min(1).max(120),
  selectedAnswer: z.enum(["A", "B", "C", "D"]),
  correct: z.boolean(),
});

export const GET = withErrorHandling<GrammarProgressResponse>(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return ok<GrammarProgressResponse>({ authenticated: false, topics: {} });
  const topicId = req.nextUrl.searchParams.get("topicId")?.trim();
  const colRef = adminDb.collection("users").doc(user.uid).collection("grammarProgress");

  if (topicId) {
    const snap = await colRef.doc(topicId).get();
    return ok<GrammarProgressResponse>({
      authenticated: true,
      topicId,
      answers: snap.exists ? extractGrammarTopicAnswers(snap.data()) : {},
    });
  }

  const snap = await colRef.limit(50).get();
  const topics: Record<string, GrammarAnswers> = {};
  for (const doc of snap.docs) {
    topics[doc.id] = extractGrammarTopicAnswers(doc.data());
  }
  return ok<GrammarProgressResponse>({ authenticated: true, topics });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return ok({ saved: false, authenticated: false });
  const body = await parseBody(req, grammarProgressSchema);
  const now = Date.now();
  const docRef = adminDb
    .collection("users")
    .doc(user.uid)
    .collection("grammarProgress")
    .doc(body.topicId);

  await Promise.all([
    docRef.set(
      {
        topicId: body.topicId,
        answers: {
          [body.questionId]: body.selectedAnswer,
        },
        updatedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
    recordStudyActivity(user.uid, {
      module: "reading",
      activityType: "grammar_question",
      sourceId: `${body.topicId}:${body.questionId}`,
      occurredAtMillis: now,
      metric: "reading",
      quantity: 1,
      durationSeconds: 15,
    }).catch(() => undefined),
  ]);

  return ok({ saved: true, authenticated: true });
});
