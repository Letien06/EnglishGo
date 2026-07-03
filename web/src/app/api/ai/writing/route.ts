import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { submit } from "@/lib/services/ai-writing";

const schema = z.object({
  prompt: z.string().min(1),
  responseText: z.string().min(1),
});

export const POST = withErrorHandling(async (req) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, schema);
  return ok(await submit(user, body.prompt, body.responseText));
});
