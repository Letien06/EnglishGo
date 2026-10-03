import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { submitAnswer } from "@/lib/services/game-room";

const schema = z.object({
  code: z.string().length(6),
  questionIndex: z.number(),
  correct: z.boolean(),
  selected: z.string().default(""),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);

  const result = await submitAnswer(
    user,
    body.code.toUpperCase(),
    body.questionIndex,
    body.correct,
    body.selected,
  );

  return ok(result);
});
