import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUserForRead } from "@/lib/auth/session";
import { getMembershipCheckout } from "@/lib/services/payments";

export const GET = withErrorHandling(async () => {
  const user = await requireUserForRead();
  return ok(await getMembershipCheckout(user.uid), { headers: { "Cache-Control": "no-store" } });
});
