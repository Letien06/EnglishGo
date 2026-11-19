import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getReadIdentity, requireUser } from "@/lib/auth/session";
import { createRoom } from "@/lib/services/game-room";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const schema = z.object({
  vocabSetId: z.number().int().min(0),
  gameMode: z.enum(["blast", "rain"]),
  words: z.array(z.object({
    id: z.number().int(),
    word: z.string().max(160),
    meaning: z.string().max(500),
    audioUrl: z.string().max(500).optional(),
    audioUsUrl: z.string().max(500).optional(),
    audioUkUrl: z.string().max(500).optional(),
  })).min(1).max(200),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  await enforceDailyActionLimit(user.uid, "game-room-create", 60);
  const body = await parseBody(req, schema);

  const result = await createRoom(user, body.vocabSetId, body.gameMode, body.words);

  return ok({ ...result, currentUserId: user.uid });
});

export const GET = withErrorHandling(async (req) => {
  const user = await getReadIdentity();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim().toUpperCase();
  if (!code || !ROOM_CODE_PATTERN.test(code)) {
    return ok(null);
  }

  const { getRoomWithPlayers } = await import("@/lib/services/game-room");
  const data = await getRoomWithPlayers(code);

  // Do not perform unauthenticated write side effects inside a GET handler.
  if (
    user &&
    data.room &&
    data.room.raceVersion !== 2 &&
    data.room.status === "playing" &&
    data.players.length >= 1 &&
    data.players.some((p) => p.uid === user.uid) &&
    data.players.every((p) => (p.lives ?? 3) <= 0)
  ) {
    const { adminDb } = await import("@/lib/firestore/db");
    const { COLLECTIONS } = await import("@/lib/firestore/collections");
    await adminDb.collection(COLLECTIONS.gameRooms).doc(code).update({ status: "finished" });
    data.room.status = "finished";
  }

  return ok({ ...data, currentUserId: user?.uid ?? "" });
});
