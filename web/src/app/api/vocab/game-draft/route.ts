import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import {
  deleteVocabGameDraft,
  getVocabGameDraft,
  saveVocabGameDraft,
} from "@/lib/services/vocab-game-draft";

const schema = z.object({
  setId: z.coerce.number().int().positive(),
  mode: z.string().optional().nullable(),
  quizMode: z.string().optional().nullable(),
  externalPartId: z.string().optional().nullable(),
  payload: z.string().optional().nullable(),
});

function inputFromRequest(req: Request) {
  const url = new URL(req.url);
  return {
    setId: Number(url.searchParams.get("setId")),
    mode: url.searchParams.get("mode"),
    quizMode: url.searchParams.get("quizMode"),
    externalPartId: url.searchParams.get("externalPartId"),
  };
}

export const GET = withErrorHandling(async (req) => {
  const user = await requireUser();
  return ok(await getVocabGameDraft(user.uid, inputFromRequest(req)));
});

export const PUT = withErrorHandling(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, schema);
  return ok(await saveVocabGameDraft(user.uid, body));
});

export const POST = PUT;

export const DELETE = withErrorHandling(async (req) => {
  const user = await requireUser();
  return ok(await deleteVocabGameDraft(user.uid, inputFromRequest(req)));
});
