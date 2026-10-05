import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { resetRoomToLobby } from "@/lib/services/game-room";

const schema = z.object({
  code: z.string().length(6),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);

  const result = await resetRoomToLobby(user, body.code.toUpperCase());

  return ok({ success: true, ...result });
});
