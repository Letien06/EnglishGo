import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { createRoom } from "@/lib/services/game-room";

const schema = z.object({
  vocabSetId: z.number(),
  gameMode: z.enum(['blast', 'rain']),
  words: z.array(z.object({
    id: z.number(),
    word: z.string(),
    meaning: z.string(),
    audioUrl: z.string().optional(),
    audioUsUrl: z.string().optional(),
    audioUkUrl: z.string().optional()
  }))
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  
  const result = await createRoom(user, body.vocabSetId, body.gameMode, body.words);
  
  return ok({ ...result, currentUserId: user.uid });
});

export const GET = withErrorHandling(async (req) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim().toUpperCase();
  if (!code || code.length !== 6) {
    return ok(null);
  }

  const { getRoomWithPlayers } = await import("@/lib/services/game-room");
  const data = await getRoomWithPlayers(code);
  return ok({ ...data, currentUserId: user.uid });
});

