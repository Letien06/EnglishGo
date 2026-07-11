import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireRole } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";
import { z } from "zod";

const schema = z.object({
  startSeconds: z.coerce.number(), endSeconds: z.coerce.number(), speaker: z.string().max(100).nullable().default(null),
  expectedText: z.string().min(1).max(10_000), acceptedNormalizedAnswers: z.array(z.string().max(1000)).max(10).default([]),
});

export const PATCH = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ lessonId, segmentId }, user, body] = await Promise.all([context.params, requireRole("ADMIN"), parseBody(req, schema)]);
  return ok(await dictation.updateSegment(lessonId, segmentId, body, user.uid));
});
