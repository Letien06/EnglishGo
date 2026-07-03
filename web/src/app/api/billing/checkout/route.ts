import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { checkout } from "@/lib/services/billing";

const schema = z.object({
  planId: z.string().min(1),
  provider: z.string().min(1),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  return ok(await checkout(user.uid, body.planId, body.provider));
});
