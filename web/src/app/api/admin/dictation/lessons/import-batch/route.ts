import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { dictationBatchImportSchema } from "@/lib/api/dictation-validate";
import { requireRole } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const [user, body] = await Promise.all([requireRole("ADMIN"), parseBody(req, dictationBatchImportSchema)]);
  return ok(await dictation.importPublishedBatch(body.lessons, user.uid), { status: 201 });
});
