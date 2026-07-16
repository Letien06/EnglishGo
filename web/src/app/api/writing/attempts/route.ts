import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { submitWritingAttempt } from "@/lib/services/writing";

const attemptSchema = z.object({
  promptId: z.string().trim().min(1).max(120),
  responseText: z.string().trim().min(1).max(8_000),
  elapsedSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  usedHintLevels: z.array(z.number().int().min(1).max(5)).max(5).optional(),
  usedSample: z.boolean().optional(),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, attemptSchema);
  return ok(await submitWritingAttempt(user, body));
});

