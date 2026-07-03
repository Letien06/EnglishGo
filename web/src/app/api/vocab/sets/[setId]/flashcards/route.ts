/**
 * GET /api/vocab/sets/:setId/flashcards — flashcard session
 *
 * Query params: mastery, order, amount (all optional).
 * Port of VocabularyController GET /vocab/sets/{setId}/flashcards.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = Number(setId);
    if (!id) return fail("Invalid set ID", 400);

    const url = new URL(req.url);
    const mastery = url.searchParams.get("mastery") ?? undefined;
    const order = url.searchParams.get("order") ?? undefined;
    const amount = url.searchParams.get("amount") ?? undefined;

    const user = await getCurrentUser();
    const uid = user?.uid ?? "";

    // If filters are provided, use filtered session; otherwise plain session
    if (mastery || order || amount) {
      const session = await vocab.getFilteredSession(
        id,
        uid,
        mastery ?? "all",
        order ?? "original",
        amount ?? "all",
      );
      return ok(session);
    }

    const session = await vocab.getSession(id);
    return ok(session);
  },
);
