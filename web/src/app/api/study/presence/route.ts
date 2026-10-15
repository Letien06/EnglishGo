import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { parseBody } from "@/lib/api/validate";
import { getOnlinePresence, recordOnlinePresence } from "@/lib/services/online-presence";

const schema = z.object({
  sessionId: z.string().uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  elapsedSeconds: z.number().finite().min(0).max(60), active: z.boolean(), dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, schema);
  return ok(await recordOnlinePresence(user.uid, input));
});

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return ok(await getOnlinePresence(user.uid));
});
