import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUserForRead } from "@/lib/auth/session";
import { getPetDashboard } from "@/lib/services/pet";

export const GET = withErrorHandling(async () => {
  const user = await requireUserForRead();
  return ok(await getPetDashboard(user.uid));
});
