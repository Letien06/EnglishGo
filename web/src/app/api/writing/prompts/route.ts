import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseQuery } from "@/lib/api/validate";
import { listWritingPrompts } from "@/lib/services/writing";
import type { WritingPart } from "@/types/writing";

const querySchema = z.object({
  part: z.enum(["1", "2", "3"]).optional(),
});

/** Public catalog of original Writing prompts. Learner attempts stay private. */
export const GET = withErrorHandling(async (req) => {
  const query = parseQuery(req.nextUrl, querySchema);
  const part = query.part ? Number(query.part) as WritingPart : undefined;
  return ok(await listWritingPrompts(part), {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
});
