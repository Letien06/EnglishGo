import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import { buyPetFood } from "@/lib/services/pet";

const schema = z.object({
  foodId: z.enum(["KIBBLE", "SALMON", "PATE", "CAKE"]),
});

export const POST = withErrorHandling(async (req) => {
  const [user, body] = await Promise.all([requireUser(), parseBody(req, schema)]);
  return ok(await buyPetFood(user.uid, body.foodId));
});
