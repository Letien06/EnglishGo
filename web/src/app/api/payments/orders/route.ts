import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createMembershipOrder } from "@/lib/services/payments";

export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  return ok(await createMembershipOrder(user.uid), { headers: { "Cache-Control": "no-store" } });
});
