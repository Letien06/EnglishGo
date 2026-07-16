import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { reportContentQuestion } from "@/lib/services/content-quality";

const schema = z.object({
  attemptId: z.coerce.number().int().positive(),
  questionId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  return ok(await reportContentQuestion(user.uid, body));
});
