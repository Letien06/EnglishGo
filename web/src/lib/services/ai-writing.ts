import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import type { AppUser } from "@/types";

export interface AiWritingJob {
  id: string;
  prompt: string;
  responseText: string;
  status: string;
  feedback: string;
  createdAtMillis: number | null;
  completedAtMillis: number | null;
}

export async function recentJobs(uid: string | null): Promise<AiWritingJob[]> {
  if (!uid) return [];
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("aiWritingJobs")
    .get();
  return snap.docs
    .map(toJob)
    .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0))
    .slice(0, 20);
}

export async function submit(
  user: AppUser | null,
  prompt: string,
  responseText: string,
): Promise<AiWritingJob> {
  if (!user) throw Unauthorized("User not found");
  if (!prompt.trim() || !responseText.trim()) {
    throw BadRequest("Prompt and response are required");
  }

  const now = Date.now();
  const data = {
    prompt: prompt.trim(),
    responseText: responseText.trim(),
    status: "COMPLETED",
    feedback: buildFeedback(responseText),
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
  return { id: ref.id, ...data };
}

function toJob(doc: FirebaseFirestore.DocumentSnapshot): AiWritingJob {
  return {
    id: doc.id,
    prompt: stringValue(doc.get("prompt")) ?? "",
    responseText: stringValue(doc.get("responseText")) ?? "",
    status: stringValue(doc.get("status")) ?? "COMPLETED",
    feedback: stringValue(doc.get("feedback")) ?? "",
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

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
