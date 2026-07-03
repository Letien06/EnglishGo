import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { addComment, comments } from "@/lib/services/community";

const schema = z.object({
  content: z.string().min(1),
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
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
