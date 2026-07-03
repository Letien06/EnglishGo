import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";

export const GET = withErrorHandling(async () => {
  return ok({
    items: [],
    total: 0,
    page: 0,
    size: 20,
  });
});
