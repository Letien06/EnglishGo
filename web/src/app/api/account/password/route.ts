import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireRecentAuth } from "@/lib/auth/session";
import { changePassword } from "@/lib/services/account";

const schema = z.object({
  newPassword: z.string().min(6).max(128),
});

export const POST = withErrorHandling(async (req) => {
  const { uid } = await requireRecentAuth(300);
  const body = await parseBody(req, schema);
  await changePassword(uid, body);
  return ok({ updated: true });
});
