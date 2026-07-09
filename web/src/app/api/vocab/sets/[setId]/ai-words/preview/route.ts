import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";

const previewSchema = z.object({
  mode: z.string().optional(),
  input: z.string().optional(),
  count: z.coerce.number().optional(),
  image: z.string().optional(),
  imageMimeType: z.string().optional(),
});

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = Number(setId);
    if (!Number.isInteger(id) || id <= 0) throw BadRequest("Invalid set ID");

    const user = await requireUser();
    await enforceDailyActionLimit(user.uid, "vocab-ai-preview", 30);
    const body = await parseBody(req, previewSchema);
    const candidates = await vocab.previewAiWords(
      id,
      user.uid,
      body.mode ?? "text",
      body.input ?? "",
      body.count ?? 10,
      body.image,
      body.imageMimeType,
    );

    return ok(candidates);
  },
);
