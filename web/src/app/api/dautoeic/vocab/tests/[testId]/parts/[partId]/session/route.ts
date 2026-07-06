import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { testId, partId } = await params;
    const user = await getCurrentUser();
    const synced = await dautoeicVocab.syncDautoeicVocabTest(testId, partId);
    const url = new URL(req.url);
    const session = await vocab.getFilteredSessionForPart(
      synced.setId,
      user?.uid ?? null,
      partId,
      url.searchParams.get("mastery") ?? "all",
      url.searchParams.get("order") ?? "random",
      url.searchParams.get("amount") ?? "all",
    );
    return ok(session);
  },
);
