import { adminDb } from "@/lib/firestore/db";
import { BadRequest } from "@/lib/api/response";
import { enforceDailyActionLimit } from "./rate-limit";

export interface VocabGameDraftView {
  setId: number;
  draftKey: string;
  payload: string;
  updatedAtMillis: number;
}

export interface VocabGameDraftInput {
  setId: number;
  mode?: string | null;
  quizMode?: string | null;
  externalPartId?: string | null;
}

export async function getVocabGameDraft(
  uid: string,
  input: VocabGameDraftInput,
): Promise<VocabGameDraftView | null> {
  const key = draftKey(input);
  const snap = await draftRef(uid, key).get();
  if (!snap.exists) return null;
  return {
    setId: normalizeSetId(input.setId),
    draftKey: key,
    payload: stringValue(snap.get("payload")) ?? "{}",
    updatedAtMillis: numberValue(snap.get("updatedAtMillis")) ?? 0,
  };
}

export async function saveVocabGameDraft(
  uid: string,
  input: VocabGameDraftInput & { payload?: string | null },
): Promise<VocabGameDraftView> {
  const setId = normalizeSetId(input.setId);
  const key = draftKey(input);
  const payload = normalizePayload(input.payload);
  const updatedAtMillis = Date.now();
  await enforceDailyActionLimit(uid, "vocab-game-draft", 1500);
  await draftRef(uid, key).set(
    {
      setId,
      draftKey: key,
      mode: cleanSegment(input.mode),
      quizMode: cleanSegment(input.quizMode),
      externalPartId: cleanSegment(input.externalPartId),
      payload,
      updatedAtMillis,
    },
    { merge: true },
  );
  return { setId, draftKey: key, payload, updatedAtMillis };
}

export async function deleteVocabGameDraft(
  uid: string,
  input: VocabGameDraftInput,
): Promise<{ deleted: true; draftKey: string }> {
  const key = draftKey(input);
  await draftRef(uid, key).delete().catch(() => undefined);
  return { deleted: true, draftKey: key };
}

function draftRef(uid: string, key: string) {
  return adminDb.collection("users").doc(uid).collection("vocabGameDrafts").doc(key);
}

function draftKey(input: VocabGameDraftInput): string {
  const setId = normalizeSetId(input.setId);
  return [
    "vocab",
    setId,
    cleanSegment(input.externalPartId) || "all",
    cleanSegment(input.mode) || "mixed",
    cleanSegment(input.quizMode) || "default",
  ].join("-");
}

function normalizeSetId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw BadRequest("Invalid set id");
  return value;
}

function normalizePayload(value: string | null | undefined): string {
  if (!value?.trim()) return "{}";
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return "{}";
    return JSON.stringify(parsed);
  } catch {
    return "{}";
  }
}

function cleanSegment(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
    : "";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
