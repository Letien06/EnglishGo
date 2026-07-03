import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const candidateSchema = z.object({
  word: z.string(),
  meaning: z.string().optional().nullable(),
  partOfSpeech: z.string().optional().nullable(),
  phonetic: z.string().optional().nullable(),
  example: z.string().optional().nullable(),
  selected: z.boolean().optional(),
});

const saveSchema = z.object({
  candidates: z.array(candidateSchema).min(1, "No candidates provided"),
});

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = Number(setId);
    if (!Number.isInteger(id) || id <= 0) throw BadRequest("Invalid set ID");

    await requireUser();
    const body = await parseBody(req, saveSchema);
    const count = await vocab.saveAiWords(id, body.candidates);
    return ok({ saved: count });
  },
);
