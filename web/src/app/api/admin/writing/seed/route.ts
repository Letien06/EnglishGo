import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireRole } from "@/lib/auth/session";
import { seedDefaultWritingPrompts } from "@/lib/services/writing";

export const POST = withErrorHandling(async () => {
  const user = await requireRole("ADMIN");
  return ok(await seedDefaultWritingPrompts(user.uid));
});
