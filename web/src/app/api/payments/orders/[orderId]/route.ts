import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUserForRead } from "@/lib/auth/session";
import { getMembershipCheckout } from "@/lib/services/payments";

export const GET = withErrorHandling(async (_req, context) => {
  const user = await requireUserForRead();
  const { orderId } = await context.params;
  return ok(await getMembershipCheckout(user.uid, orderId), { headers: { "Cache-Control": "no-store" } });
});
