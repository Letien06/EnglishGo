/**
 * GET  /api/vocab/community/folders/:folderId       — folder detail + sets
 * POST /api/vocab/community/folders/:folderId/copy  — copy folder
 *
 * Port of VocabularyController community folder endpoints.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

function parseFolderId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw BadRequest("Invalid folder ID");
  return id;
}

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { folderId } = await params;
    const id = parseFolderId(folderId);

    const url = new URL(req.url);
    const user = await getCurrentUser();

    const folder = await vocab.getCommunityFolderCard(id);
    const sets = await vocab.findCommunitySetCards(id);

    // Also provide user's own sets for copy-into target selector
    let mySets: { id: number; title: string }[] = [];
    if (user) {
      const mySetCards = await vocab.findMySetCards(user.uid);
      mySets = mySetCards.map((s) => ({ id: s.id, title: s.title }));
    }

    const practiceOptions = user
      ? await vocab.findPracticeSetOptions(user.uid)
      : [];

    void url; // consumed above

    return ok({ folder, sets, mySets, practiceOptions });
  },
);

export const POST = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { folderId } = await params;
    const id = parseFolderId(folderId);
    const user = await requireUser();

    const result = await vocab.copyCommunityFolder(user.uid, id);
    return ok(result);
  },
);
