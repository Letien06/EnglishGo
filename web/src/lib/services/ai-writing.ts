import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import type { AppUser } from "@/types";
import { generateJson } from "./gemini";
import { enforceDailyActionLimit } from "./rate-limit";
import { recordStudyActivity } from "./study-activity";

export interface AiWritingFeedbackIssue {
  problem: string;
  fix: string;
  example?: string | null;
}

export interface AiWritingStructuredFeedback {
  scoreEstimate: number | null;
  taskFulfillment: string | null;
  grammar: string | null;
  vocabulary: string | null;
  organization: string | null;
  strengths: string[];
  issues: AiWritingFeedbackIssue[];
  rewrittenAnswer: string | null;
  nextPrompt: string | null;
}

export interface AiWritingJob {
  id: string;
  prompt: string;
  responseText: string;
  status: string;
  feedback: string;
  structuredFeedback?: AiWritingStructuredFeedback | null;
  createdAtMillis: number | null;
  completedAtMillis: number | null;
}

export async function recentJobs(uid: string | null): Promise<AiWritingJob[]> {
  if (!uid) return [];
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("aiWritingJobs")
    .orderBy("createdAtMillis", "desc")
    .limit(20)
    .get();
  return snap.docs.map(toJob);
}

export async function submit(
  user: AppUser | null,
  prompt: string,
  responseText: string,
): Promise<AiWritingJob> {
  if (!user) throw Unauthorized("User not found");
  const cleanPrompt = prompt.trim();
  const cleanResponse = responseText.trim();
  if (!cleanPrompt || !cleanResponse) {
    throw BadRequest("Prompt and response are required");
  }
  if (cleanPrompt.length > 2000) throw BadRequest("Prompt is too long");
  if (cleanResponse.length > 8000) throw BadRequest("Response is too long");
  await enforceDailyActionLimit(user.uid, "ai-writing", 20);

  const now = Date.now();
  const feedbackResult = await buildAiFeedback(cleanPrompt, cleanResponse)
    .catch((error) => ({
      feedback: `${buildFeedback(cleanResponse)}\n\nAI feedback fallback: ${error instanceof Error ? error.message : "provider unavailable"}`,
      feedbackJson: null,
      providerStatus: "FALLBACK",
    }));
  const data = {
    prompt: cleanPrompt,
    responseText: cleanResponse,
    status: "COMPLETED",
    feedback: feedbackResult.feedback,
    feedbackJson: feedbackResult.feedbackJson,
    providerStatus: feedbackResult.providerStatus,
    createdAtMillis: now,
    completedAtMillis: now,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await adminDb
    .collection("users")
    .doc(user.uid)
    .collection("aiWritingJobs")
    .add(data);
  await recordStudyActivity(user.uid, {
    module: "writing",
    activityType: "ai_writing",
    sourceId: ref.id,
    occurredAtMillis: now,
    metric: "vocab",
    quantity: 1,
    durationSeconds: 60,
  }).catch(() => undefined);
  return {
    id: ref.id,
    ...data,
    structuredFeedback: parseAiWritingFeedback(data.feedbackJson),
  };
}

export function parseAiWritingFeedback(
  rawJson: string | null | undefined,
): AiWritingStructuredFeedback | null {
  if (!rawJson?.trim()) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;
    const strengths = arrayValue(data.strengths)
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
    const issues = arrayValue(data.issues)
      .map((issue) => (issue && typeof issue === "object" ? (issue as Record<string, unknown>) : null))
      .filter((issue): issue is Record<string, unknown> => Boolean(issue))
      .map((issue) => ({
        problem: stringValue(issue.problem)?.trim() ?? "",
        fix: stringValue(issue.fix)?.trim() ?? "",
        example: stringValue(issue.example)?.trim() ?? null,
      }))
      .filter((issue) => Boolean(issue.problem || issue.fix))
      .slice(0, 5);
    return {
      scoreEstimate: numberValue(data.scoreEstimate),
      taskFulfillment: stringValue(data.taskFulfillment),
      grammar: stringValue(data.grammar),
      vocabulary: stringValue(data.vocabulary),
      organization: stringValue(data.organization),
      strengths,
      issues,
      rewrittenAnswer: stringValue(data.rewrittenAnswer),
      nextPrompt: stringValue(data.nextPrompt),
    };
  } catch {
    return null;
  }
}

async function buildAiFeedback(prompt: string, responseText: string): Promise<{
  feedback: string;
  feedbackJson: string;
  providerStatus: string;
}> {
  const result = await generateJson(`You are a TOEIC Writing coach for Vietnamese learners.
Grade the learner response against the prompt.
Return one JSON object only with these keys:
- scoreEstimate: integer 0-100
- taskFulfillment: short string
- grammar: short string
- vocabulary: short string
- organization: short string
- strengths: array of 2 short strings
- issues: array of 3 objects {problem, fix, example}
- rewrittenAnswer: improved answer, same intent, natural English
- nextPrompt: one short follow-up writing prompt

Prompt:
"""${prompt}"""

Learner response:
"""${responseText}"""`);
  const feedback = normalizeAiFeedback(result);
  return {
    feedback,
    feedbackJson: JSON.stringify(result),
    providerStatus: "GEMINI",
  };
}

function normalizeAiFeedback(value: unknown): string {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const strengths = arrayValue(data.strengths).map(String).filter(Boolean).slice(0, 3);
  const issues = arrayValue(data.issues)
    .map((issue) => issue && typeof issue === "object" ? issue as Record<string, unknown> : null)
    .filter((issue): issue is Record<string, unknown> => Boolean(issue))
    .slice(0, 5);
  const lines = [
    `Score estimate: ${numberValue(data.scoreEstimate) ?? "N/A"}/100`,
    `Task fulfillment: ${stringValue(data.taskFulfillment) ?? "N/A"}`,
    `Grammar: ${stringValue(data.grammar) ?? "N/A"}`,
    `Vocabulary: ${stringValue(data.vocabulary) ?? "N/A"}`,
    `Organization: ${stringValue(data.organization) ?? "N/A"}`,
  ];
  if (strengths.length) {
    lines.push("", "Strengths:");
    strengths.forEach((item) => lines.push(`- ${item}`));
  }
  if (issues.length) {
    lines.push("", "Priority fixes:");
    issues.forEach((issue) => {
      lines.push(`- ${stringValue(issue.problem) ?? "Issue"} -> ${stringValue(issue.fix) ?? "Fix"}`);
      const example = stringValue(issue.example);
      if (example) lines.push(`  Example: ${example}`);
    });
  }
  const rewritten = stringValue(data.rewrittenAnswer);
  if (rewritten) lines.push("", "Rewritten answer:", rewritten);
  const nextPrompt = stringValue(data.nextPrompt);
  if (nextPrompt) lines.push("", `Next prompt: ${nextPrompt}`);
  return lines.join("\n");
}

function toJob(doc: FirebaseFirestore.DocumentSnapshot): AiWritingJob {
  const feedbackJson = stringValue(doc.get("feedbackJson"));
  return {
    id: doc.id,
    prompt: stringValue(doc.get("prompt")) ?? "",
    responseText: stringValue(doc.get("responseText")) ?? "",
    status: stringValue(doc.get("status")) ?? "COMPLETED",
    feedback: stringValue(doc.get("feedback")) ?? "",
    structuredFeedback: parseAiWritingFeedback(feedbackJson),
    createdAtMillis: numberValue(doc.get("createdAtMillis")),
    completedAtMillis: numberValue(doc.get("completedAtMillis")),
  };
}

function buildFeedback(responseText: string): string {
  const words = responseText.trim() ? responseText.trim().split(/\s+/) : [];
  const sentenceCount = responseText.split(/[.!?]+/).filter((s) => s.trim()).length;
  const fluency = words.length >= 80 ? "Good development" : "Add more supporting detail";
  const structure = sentenceCount >= 4 ? "Clear sentence variety" : "Use more complete sentences";
  return `Words: ${words.length}. ${fluency}. ${structure}.`;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
