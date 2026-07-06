import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { updateSettings } from "@/lib/services/account";

const schema = z.object({
  displayName: z.string().min(1).max(150),
  avatarUrl: z.string().max(260_000).nullable().optional(),
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  return ok(await updateSettings(user.uid, body));
});
