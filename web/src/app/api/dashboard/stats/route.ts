import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { BadRequest, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/services/dashboard";

export const GET = withErrorHandling(async (request) => {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const period = z.enum(["today", "week", "month", "all", "custom"]).safeParse(params.get("period") ?? "today");
  if (!period.success) throw BadRequest("Invalid dashboard period");
  return ok(await getDashboardStats(user.uid, period.data, params.get("start") ?? undefined, params.get("end") ?? undefined));
});
