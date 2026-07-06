import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";

export const GET = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { testId } = await params;
    const user = await getCurrentUser();
    const detail = await dautoeicVocab.getDautoeicVocabTestView(testId, user?.uid);
    return ok(detail);
  },
);
