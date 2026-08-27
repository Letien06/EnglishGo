import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getPetWidgetSummary } from "@/lib/services/pet";

/** Lightweight data for the floating companion, not the full Pet dashboard. */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return ok(await getPetWidgetSummary(user.uid));
});
