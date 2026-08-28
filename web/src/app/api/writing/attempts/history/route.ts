import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseQuery } from "@/lib/api/validate";
import { requireUserForRead } from "@/lib/auth/session";
import { listWritingAttemptHistory } from "@/lib/services/writing";
import type { WritingPart } from "@/types/writing";

const querySchema = z.object({
  part: z.enum(["1", "2", "3"]).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export const GET = withErrorHandling(async (req) => {
  const user = await requireUserForRead();
  const query = parseQuery(req.nextUrl, querySchema);
  return ok(await listWritingAttemptHistory(user.uid, {
    part: query.part ? Number(query.part) as WritingPart : undefined,
    limit: query.limit,
  }));
});
