/**
 * GET /api/vocab/review — get review session (due words across all sets)
 *
 * Query: ?size=20 (default 20)
 * Port of VocabularyController GET /vocab/review.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();

  const url = new URL(req.url);
  const size = Number(url.searchParams.get("size") ?? "20");

  const session = await vocab.getReviewSession(user.uid, size);
  return ok(session);
});
