import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { warmupPracticeContent } from "@/lib/services/practice";

const schema = z.object({
  mode: z.string().optional().nullable(),
  parts: z.array(z.coerce.number()).optional().nullable(),
  durationMinutes: z.coerce.number().optional().nullable(),
});

export const POST = withErrorHandling(async (req, ctx) => {
  await requireUser();
  const params = await ctx.params;
  const testId = Number(params.testId);
  const body = await parseBody(req, schema);
  return ok(await warmupPracticeContent(testId, body));
});
