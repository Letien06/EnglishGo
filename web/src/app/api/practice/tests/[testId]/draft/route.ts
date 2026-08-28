import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser, requireUserForRead } from "@/lib/auth/session";
import { deleteDraft, getDraft, saveDraft } from "@/lib/services/practice";

const schema = z.object({
  payload: z.string().optional().nullable(),
  mode: z.string().optional().nullable(),
  parts: z.array(z.coerce.number()).optional().nullable(),
  durationMinutes: z.coerce.number().optional().nullable(),
  currentQuestionIndex: z.coerce.number().optional().nullable(),
});

function inputFromSearchParams(req: Request) {
  const url = new URL(req.url);
  return {
    mode: url.searchParams.get("mode"),
    parts: url.searchParams.get("parts"),
    durationMinutes: url.searchParams.get("time") ?? url.searchParams.get("durationMinutes"),
  };
}

export const GET = withErrorHandling(async (req, ctx) => {
  const user = await requireUserForRead();
  const params = await ctx.params;
  const testId = Number(params.testId);
  return ok(await getDraft(user.uid, testId, inputFromSearchParams(req)));
});

export const PUT = withErrorHandling(async (req, ctx) => {
  const user = await requireUser();
  const params = await ctx.params;
  const testId = Number(params.testId);
  const body = await parseBody(req, schema);
  return ok(await saveDraft(user.uid, testId, body.payload ?? "{}", body, body.currentQuestionIndex));
});

export const POST = PUT;

export const DELETE = withErrorHandling(async (req, ctx) => {
  const user = await requireUser();
  const params = await ctx.params;
  const testId = Number(params.testId);
  return ok(await deleteDraft(user.uid, testId, inputFromSearchParams(req)));
});
