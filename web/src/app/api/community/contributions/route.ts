import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { submitContribution } from "@/lib/services/community";

const schema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  sourceNote: z.string().nullable().optional(),
  ownsRights: z.boolean(),
});

export const POST = withErrorHandling(async (req) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, schema);
  return ok(
    await submitContribution(
      user,
      body.title,
      body.content,
      body.sourceNote,
      body.ownsRights,
    ),
  );
});
