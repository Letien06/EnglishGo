/**
 * POST /api/listening/reset — reset progress for a listening part + level.
 *
 * Port of `ListeningProgressController.postReset()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { toolRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as listening from "@/lib/services/listening";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, toolRequestSchema);
  const result = await listening.resetLevel(user?.uid ?? null, body);
  return ok(result);
});
