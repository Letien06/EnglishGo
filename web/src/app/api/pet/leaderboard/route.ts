import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseQuery } from "@/lib/api/validate";
import { getPetLeaderboard } from "@/lib/services/pet";

const schema = z.object({
  scope: z.enum(["weekly", "all-time"]).optional().default("weekly"),
});

export const GET = withErrorHandling(async (req) => {
  const { scope } = parseQuery(req.nextUrl, schema);
  return ok(await getPetLeaderboard(scope));
});
