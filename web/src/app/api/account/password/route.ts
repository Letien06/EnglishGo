import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { changePassword } from "@/lib/services/account";

const schema = z.object({
  newPassword: z.string().min(6),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  await changePassword(user.uid, body);
  return ok({ updated: true });
});
