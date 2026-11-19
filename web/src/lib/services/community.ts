import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import type { AppUser } from "@/types";
import { enforceDailyActionLimit } from "./rate-limit";
import { readServerCache } from "../server-cache";

const ALL_TIME = "ALL_TIME";
const WEEKLY = "WEEKLY";
const TARGET_TYPE_PATTERN = /^[A-Z0-9_-]{1,32}$/;

export interface CommunityComment {
  id: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  targetType: string;
  targetId: number;
  content: string;
  createdAtMillis: number | null;
}

export interface LeaderboardEntry {
  uid: string;
  email: string | null;
  displayName: string | null;
  score: number;
  period: string;
  rankPosition: number;
  updatedAtMillis: number | null;
}

export function normalizePeriod(period?: string | null): "ALL_TIME" | "WEEKLY" {
  return period?.toLowerCase() === "weekly" || period === WEEKLY
    ? WEEKLY
    : ALL_TIME;
}

export async function comments(
  targetType = "GENERAL",
  targetId = 1,
): Promise<CommunityComment[]> {
  const safeType = sanitizeTargetType(targetType);
  const safeId = sanitizeTargetId(targetId);
  const snap = await commentCollection(safeType, safeId)
    .where("deletedAtMillis", "==", null)
    .orderBy("createdAtMillis", "desc")
    .limit(30)
    .get();
  return snap.docs.map(toComment);
}

export async function addComment(
  user: AppUser | null,
  content: string,
  targetType = "GENERAL",
  targetId = 1,
): Promise<CommunityComment> {
  if (!user) throw Unauthorized("User not found");
  const trimmed = content.trim();
  if (!trimmed) throw BadRequest("Comment content is required");
  if (trimmed.length > 2_000) throw BadRequest("Comment is too long (max 2000 characters)");
  const safeType = sanitizeTargetType(targetType);
  const safeId = sanitizeTargetId(targetId);
  await enforceDailyActionLimit(user.uid, "community-comments", 30);

  const now = Date.now();
  const masked = maskEmail(user.email);
  const data = {
    uid: user.uid,
    email: masked,
    displayName: user.displayName,
    targetType: safeType,
    targetId: safeId,
    content: trimmed,
    deletedAtMillis: null,
    createdAtMillis: now,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await commentCollection(safeType, safeId).add(data);
  return {
    id: ref.id,
    uid: user.uid,
    email: masked,
    displayName: user.displayName,
    targetType: safeType,
    targetId: safeId,
    content: trimmed,
    createdAtMillis: now,
  };
}

export async function leaderboard(
  period?: string | null,
): Promise<LeaderboardEntry[]> {
  const normalized = normalizePeriod(period);
  return readServerCache(async () => {
    const snap = await leaderboardCollection(normalized)
      .orderBy("score", "desc")
      .limit(20)
      .get();
    return snap.docs.map((doc, index) => ({
      ...toLeaderboardEntry(doc, normalized),
      rankPosition: index + 1,
    }));
  }, ["community-leaderboard", normalized], { revalidate: 30, tags: [] });
}

export async function addScore(user: Pick<AppUser, "uid" | "email" | "displayName">, score: number): Promise<void> {
  if (!user.uid) return;
  const ref = leaderboardCollection(ALL_TIME).doc(user.uid);
  await ref.set(
    {
      uid: user.uid,
      email: maskEmail(user.email),
      displayName: user.displayName,
      score: FieldValue.increment(score),
      period: ALL_TIME,
      updatedAtMillis: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function submitContribution(
  user: AppUser | null,
  title: string,
  content: string,
  sourceNote?: string | null,
  ownsRights?: boolean,
): Promise<{ id: string }> {
  if (!user) throw Unauthorized("User not found");
  if (!ownsRights) {
    throw BadRequest("You must confirm you have the right to share this content.");
  }
  if (!title.trim() || !content.trim()) {
    throw BadRequest("Title and content are required.");
  }
  await enforceDailyActionLimit(user.uid, "community-contributions", 20);
  const ref = await adminDb.collection("contentAuditLogs").add({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    targetType: "COMMUNITY_CONTRIBUTION",
    action: "SUBMITTED",
    title: title.trim().slice(0, 200),
    content: content.trim().slice(0, 10_000),
    sourceNote: sourceNote?.trim().slice(0, 500) || null,
    status: "PENDING",
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

function sanitizeTargetType(value: string): string {
  const upper = value.trim().toUpperCase();
  if (!TARGET_TYPE_PATTERN.test(upper)) {
    throw BadRequest("Invalid comment target type");
  }
  return upper;
}

function sanitizeTargetId(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw BadRequest("Invalid comment target ID");
  }
  return value;
}

function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.includes("*")) return trimmed;
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

function commentCollection(targetType: string, targetId: number) {
  return adminDb
    .collection("targets")
    .doc(`${targetType}_${targetId}`)
    .collection("comments");
}

function leaderboardCollection(period: string) {
  return adminDb.collection("leaderboards").doc(period).collection("entries");
}

function toComment(doc: FirebaseFirestore.DocumentSnapshot): CommunityComment {
  return {
    id: doc.id,
    uid: stringValue(doc.get("uid")) ?? "",
    email: maskEmail(stringValue(doc.get("email"))),
    displayName: stringValue(doc.get("displayName")),
    targetType: stringValue(doc.get("targetType")) ?? "GENERAL",
    targetId: numberValue(doc.get("targetId")) ?? 1,
    content: stringValue(doc.get("content")) ?? "",
    createdAtMillis: numberValue(doc.get("createdAtMillis")),
  };
}

function toLeaderboardEntry(
  doc: FirebaseFirestore.DocumentSnapshot,
  period: string,
): LeaderboardEntry {
  return {
    uid: stringValue(doc.get("uid")) ?? doc.id,
    email: maskEmail(stringValue(doc.get("email"))),
    displayName: stringValue(doc.get("displayName")),
    score: numberValue(doc.get("score")) ?? 0,
    period,
    rankPosition: 0,
    updatedAtMillis: numberValue(doc.get("updatedAtMillis")),
  };
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
