import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import type { AppUser } from "@/types";

const ALL_TIME = "ALL_TIME";
const WEEKLY = "WEEKLY";

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
  const snap = await commentCollection(targetType, targetId).get();
  return snap.docs
    .filter((doc) => doc.get("deletedAtMillis") == null)
    .map(toComment)
    .sort((a, b) => (b.createdAtMillis ?? 0) - (a.createdAtMillis ?? 0))
    .slice(0, 30);
}

export async function addComment(
  user: AppUser | null,
  content: string,
  targetType = "GENERAL",
  targetId = 1,
): Promise<CommunityComment> {
  if (!user) throw Unauthorized("User not found");
  if (!content.trim()) throw BadRequest("Comment content is required");

  const data = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    targetType,
    targetId,
    content: content.trim(),
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await commentCollection(targetType, targetId).add(data);
  return { id: ref.id, ...data };
}

export async function leaderboard(
  period?: string | null,
): Promise<LeaderboardEntry[]> {
  const normalized = normalizePeriod(period);
  const snap = await leaderboardCollection(normalized).get();
  const entries = snap.docs
    .map((doc) => toLeaderboardEntry(doc, normalized))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  return entries.map((entry, index) => ({
    ...entry,
    rankPosition: index + 1,
  }));
}

export async function addScore(user: Pick<AppUser, "uid" | "email" | "displayName">, score: number): Promise<void> {
  if (!user.uid) return;
  const ref = leaderboardCollection(ALL_TIME).doc(user.uid);
  await ref.set(
    {
      uid: user.uid,
      email: user.email,
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
  const ref = await adminDb.collection("contentAuditLogs").add({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    targetType: "COMMUNITY_CONTRIBUTION",
    action: "SUBMITTED",
    title: title.trim(),
    content: content.trim(),
    sourceNote: sourceNote?.trim() || null,
    status: "PENDING",
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
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
    email: stringValue(doc.get("email")),
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
    email: stringValue(doc.get("email")),
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
