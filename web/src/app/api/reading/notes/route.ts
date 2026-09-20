/**
 * POST /api/reading/notes — save a note for a reading item.
 *
 * Port of `ReadingProgressController.postNotes()`.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { toolRequestSchema } from "@/lib/api/learning-tool-validate";
import { getCurrentUser } from "@/lib/auth/session";
import * as reading from "@/lib/services/reading";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, toolRequestSchema);
  const result = await reading.saveNote(user?.uid ?? null, body);
  return ok(result);
});
