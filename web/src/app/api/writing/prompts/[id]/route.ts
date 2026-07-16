import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getWritingPrompt } from "@/lib/services/writing";

export const GET = withErrorHandling(async (_req, { params }) => {
  const { id } = await params;
  return ok(await getWritingPrompt(id));
});

