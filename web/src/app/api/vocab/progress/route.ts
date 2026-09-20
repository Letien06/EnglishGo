/**
 * GET /api/vocab/progress — progress tab data (stats + set cards with progress)
 *
 * Port of VocabularyController progress tab model.
 */
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(async () => {
  const user = await requireUser();

  return ok(await vocab.progressOverview(user.uid));
});
