import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireRole } from "@/lib/auth/session";
import * as writing from "@/lib/services/writing";
import type { WritingPromptInput } from "@/types/writing";
import { writingPromptPatchSchema } from "../../_validation";

export const PATCH = withErrorHandling(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const [{ promptId }, user, body] = await Promise.all([
    context.params,
    requireRole("ADMIN"),
    parseBody(req, writingPromptPatchSchema),
  ]);
  return ok(await writing.updateWritingPrompt(promptId, body as Partial<WritingPromptInput>, user.uid));
});
