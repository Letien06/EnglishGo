import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const historySchema = z.object({
  setId: z.coerce.number().int().positive(),
  externalTestId: z.string().trim().optional().nullable(),
  externalPartId: z.string().trim().optional().nullable(),
  title: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  startedAtMillis: z.coerce.number().optional().nullable(),
  totalWords: z.coerce.number().int().min(0),
  correctWords: z.coerce.number().int().min(0),
  wrongWords: z.coerce.number().int().min(0),
  accuracy: z.coerce.number().min(0).max(100),
  score: z.coerce.number().min(0),
}).refine(
  (session) => session.correctWords + session.wrongWords <= session.totalWords,
  { message: "Correct and wrong word totals cannot exceed total words" },
);

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const setId = Number(url.searchParams.get("setId"));
  const externalPartId = url.searchParams.get("externalPartId");
  const limit = Number(url.searchParams.get("limit") ?? 8);
  const history = Number.isInteger(setId) && setId > 0
    ? await vocab.findStudyHistory(user.uid, setId, externalPartId, limit)
    : [];
  return ok(history);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, historySchema);
  const result = await vocab.recordStudyHistory(user.uid, body);
  return ok(result, { status: 201 });
});
