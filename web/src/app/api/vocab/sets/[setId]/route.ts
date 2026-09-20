/**
 * GET /api/vocab/sets/:setId — set detail with word cards + progress
 *
 * Port of VocabularyController GET /vocab/sets/{setId}.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = Number(setId);
    if (!id) return fail("Invalid set ID", 400);

    const user = await getCurrentUserForRead();
    const uid = user?.uid ?? "";

    const detail = await vocab.getSetDetail(id, uid);
    return ok(detail);
  },
);
