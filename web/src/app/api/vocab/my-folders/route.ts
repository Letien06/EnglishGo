/**
 * GET  /api/vocab/my-folders           — list user's folders (optional ?q=...)
 * POST /api/vocab/my-folders           — create a new folder
 *
 * Port of VocabularyController my-folders endpoints.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required"),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();

  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;

  const folders = await vocab.findMyFolderCards(user.uid, search);
  return ok(folders);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, createFolderSchema);

  const result = await vocab.createMyFolder(user.uid, body.name);
  return ok(result, { status: 201 });
});
