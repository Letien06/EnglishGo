import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const reviewSchema = z.object({
  quality: z.coerce.number().min(0, "Quality must be 0-5").max(5, "Quality must be 0-5"),
});

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { wordId } = await params;
    const id = Number(wordId);
    if (!Number.isInteger(id) || id <= 0) throw BadRequest("Invalid word ID");

    const user = await requireUser();
    const body = await parseBody(req, reviewSchema);
    const result = await vocab.review(user.uid, id, body.quality);
    return ok(result);
  },
);
