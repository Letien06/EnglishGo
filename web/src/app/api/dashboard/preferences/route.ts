import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { dashboardPreferencesSchema, updateDashboardPreferences } from "@/lib/services/dashboard";

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, dashboardPreferencesSchema);
  return ok(await updateDashboardPreferences(user.uid, input));
});
