import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";

export interface AdminMetric {
  label: string;
  value: number;
}

export interface ContentReviewItem {
  id: string;
  title: string;
  action: string;
  status: string;
  displayName: string | null;
  createdAtMillis: number | null;
}

export async function dashboardMetrics(): Promise<AdminMetric[]> {
  const collections = [
    ["Users", "users"],
    ["Vocab sets", "vocabSets"],
    ["Vocab words", "vocabWords"],
    ["Media assets", "mediaAssets"],
    ["Audit logs", "contentAuditLogs"],
  ] as const;

  const values = await Promise.all(
    collections.map(async ([label, collection]) => ({
      label,
      value: await countCollection(collection),
    })),
  );
  return values;
}

export async function moduleMetrics(): Promise<AdminMetric[]> {
  const [listening, reading, vocabWords, mockTests] = await Promise.all([
    countCollection("listeningProgress"),
    countCollection("readingProgress"),
    countCollection("vocabWords"),
    countCollection("tests"),
  ]);
  return [
    { label: "Listening", value: listening },
    { label: "Reading", value: reading },
    { label: "Vocabulary", value: vocabWords },
    { label: "Mock tests", value: mockTests },
  ];
}

export async function draftQueue(): Promise<ContentReviewItem[]> {
  const snap = await adminDb.collection("contentAuditLogs").get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: stringValue(data.title) ?? stringValue(data.targetType) ?? "Draft",
        action: stringValue(data.action) ?? "SUBMITTED",
        status: stringValue(data.status) ?? "PENDING",
        displayName: stringValue(data.displayName),
        createdAtMillis: numberValue(data.createdAtMillis),
      };
    })
    .filter((item) => ["PENDING", "DRAFT", "SUBMITTED"].includes(item.status.toUpperCase()))
    .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0))
    .slice(0, 50);
}

export async function createGeneratorDraft(
  user: AppUser,
  input: { part: string; topic: string; count: number },
): Promise<{ id: string }> {
  const ref = await adminDb.collection("contentAuditLogs").add({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    targetType: "AI_GENERATOR",
    action: "DRAFT_SCHEMA",
    status: "PENDING",
    title: `${input.part}: ${input.topic}`,
    part: input.part,
    topic: input.topic,
    count: input.count,
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

async function countCollection(collection: string): Promise<number> {
  try {
    const snap = await adminDb.collection(collection).get();
    return snap.size;
  } catch {
    return 0;
  }
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
