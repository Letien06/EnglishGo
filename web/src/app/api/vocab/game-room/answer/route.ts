import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { submitRaceEvents } from "@/lib/services/game-room";

const schema = z.object({
  code: z.string().length(6),
  runId: z.string().uuid(),
  events: z.array(z.object({
    seq: z.number().int().min(1),
    type: z.enum(["answer", "timeout", "finish"]),
    questionIndex: z.number().int().min(0),
    selected: z.string().max(500).default(""),
    at: z.number().finite(),
  })).min(1).max(20),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);

  const result = await submitRaceEvents(
    user,
    body.code.toUpperCase(),
    body.runId,
    body.events,
  );

  return ok(result);
});
