import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { saveDraft } from "@/lib/services/practice";

const schema = z.object({
  payload: z.string().optional().nullable(),
});

export const POST = withErrorHandling(async (req, ctx) => {
  const user = await requireUser();
  const params = await ctx.params;
  const testId = Number(params.testId);
  const body = await parseBody(req, schema);
  return ok(await saveDraft(user.uid, testId, body.payload ?? "{}"));
});
