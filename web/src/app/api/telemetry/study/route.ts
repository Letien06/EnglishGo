import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { ok } from "@/lib/api/response";
import { logInfo } from "@/lib/logging";

const schema = z.object({ metrics: z.array(z.object({
  name: z.enum(["open", "transition", "sync"]), skill: z.enum(["reading", "listening", "vocab"]),
  outcome: z.enum(["success", "failure"]), count: z.number().int().min(1).max(10000),
  totalMs: z.number().finite().min(0).max(3_000_000_000), maxMs: z.number().finite().min(0).max(300_000),
})).min(1).max(18) });

export const POST = withErrorHandling(async (request) => {
  const { metrics } = await parseBody(request, schema);
  for (const metric of metrics) logInfo("study-performance", metric);
  return ok({ accepted: true });
});
