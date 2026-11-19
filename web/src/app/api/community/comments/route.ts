import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { addComment, comments } from "@/lib/services/community";

const schema = z.object({
  content: z.string().trim().min(1).max(2_000),
  targetType: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  targetId: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export const GET = withErrorHandling(async () => {
  return ok(await comments("GENERAL", 1));
});

export const POST = withErrorHandling(async (req) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, schema);
  return ok(
    await addComment(
      user,
      body.content,
      body.targetType ?? "GENERAL",
      body.targetId ?? 1,
    ),
  );
});
