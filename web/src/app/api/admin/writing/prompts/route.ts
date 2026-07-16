import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireRole } from "@/lib/auth/session";
import * as writing from "@/lib/services/writing";
import type { WritingPromptInput } from "@/types/writing";
import { writingPromptSchema } from "../_validation";

export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  const [items, overview] = await Promise.all([
    writing.listAdminWritingPrompts(),
    writing.getWritingAdminOverview(),
  ]);
  return ok({ items, overview });
});

export const POST = withErrorHandling(async (req) => {
  const [user, body] = await Promise.all([
    requireRole("ADMIN"),
    parseBody(req, writingPromptSchema),
  ]);
  return ok(await writing.createWritingPrompt(body as WritingPromptInput, user.uid), { status: 201 });
});
