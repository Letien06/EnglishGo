/**
 * GET /api/vocab/community — list community folders (optional ?q=...)
 *
 * Port of VocabularyController community tab data.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;

  const folders = await vocab.findCommunityFolderCards(search);
  return ok(folders);
});
