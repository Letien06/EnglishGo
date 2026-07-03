/**
 * GET  /api/vocab/my-sets           — list user's own sets (optional ?folderId=...)
 * POST /api/vocab/my-sets           — create a new set
 *
 * Port of VocabularyController my-sets endpoints.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const createSetSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");

  const sets = await vocab.findMySetCards(
    user.uid,
    folderId ? Number(folderId) : undefined,
  );
  return ok(sets);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, createSetSchema);

  const result = await vocab.createMySet(user.uid, body.title, body.description, body.icon);
  return ok(result, { status: 201 });
});
