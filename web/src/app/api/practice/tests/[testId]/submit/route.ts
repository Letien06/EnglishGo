import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { submit } from "@/lib/services/practice";

const schema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number(),
        selectedOptionId: z.coerce.number().nullable().optional(),
        textResponse: z.string().nullable().optional(),
      }),
    ),
});

export const POST = withErrorHandling(async (req, ctx) => {
  const user = await requireUser();
  const params = await ctx.params;
  const testId = Number(params.testId);
  const body = await parseBody(req, schema);
  return ok(await submit(user, testId, body.answers));
});
