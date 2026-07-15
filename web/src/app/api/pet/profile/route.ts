import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { updatePetProfile } from "@/lib/services/pet";

const schema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  rankOptIn: z.boolean().optional(),
});

export const PATCH = withErrorHandling(async (req) => {
  const [user, body] = await Promise.all([requireUser(), parseBody(req, schema)]);
  return ok(await updatePetProfile(user.uid, body));
});
