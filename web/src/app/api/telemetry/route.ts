import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { logInfo } from "@/lib/logging";

const schema = z.object({
  name: z.enum(["LCP", "CLS", "FID", "INP", "TTFB", "first-question", "audio"]),
  value: z.number().finite().min(0).max(300_000),
  route: z.string().max(160).regex(/^\//).optional(),
  navigationType: z.string().max(32).optional(),
});

export const POST = withErrorHandling(async req => {
  const metric = await parseBody(req, schema);
  logInfo("client-performance", metric);
  return ok({ accepted: true });
});
