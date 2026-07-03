import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireRole } from "@/lib/auth/session";
import { createGeneratorDraft } from "@/lib/services/admin";

const schema = z.object({
  part: z.string().min(1),
  topic: z.string().min(1),
  count: z.coerce.number().int().min(1).max(10),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireRole("ADMIN");
  const body = await parseBody(req, schema);
  return ok(await createGeneratorDraft(user, body), { status: 201 });
});
