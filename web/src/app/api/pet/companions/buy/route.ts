import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { buyPetCompanion } from "@/lib/services/pet";

const schema = z.object({
  companionId: z.enum(["MOCHI", "LUNA"]),
});

export const POST = withErrorHandling(async (req) => {
  const [user, body] = await Promise.all([requireUser(), parseBody(req, schema)]);
  return ok(await buyPetCompanion(user.uid, body.companionId));
});
