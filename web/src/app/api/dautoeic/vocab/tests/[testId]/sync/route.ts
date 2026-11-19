import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const user = await requireUser();
    await enforceDailyActionLimit(user.uid, "dautoeic-vocab-sync", 60);
    const { testId } = await params;
    const url = new URL(req.url);
    const partId = url.searchParams.get("partId");
    const result = await dautoeicVocab.syncDautoeicVocabTest(testId, partId);
    return ok(result);
  },
);
