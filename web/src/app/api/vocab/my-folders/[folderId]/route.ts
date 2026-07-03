/**
 * PATCH  /api/vocab/my-folders/:folderId  — rename folder
 * DELETE /api/vocab/my-folders/:folderId  — delete folder
 * POST   /api/vocab/my-folders/:folderId  — share folder
 *
 * Port of VocabularyController my-folders mutation endpoints.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const renameFolderSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

function parseFolderId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw BadRequest("Invalid folder ID");
  return id;
}

/** PATCH — rename folder */
export const PATCH = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { folderId } = await params;
    const id = parseFolderId(folderId);
    const user = await requireUser();
    const body = await parseBody(req, renameFolderSchema);

    await vocab.renameMyFolder(user.uid, id, body.name);
    return ok({ renamed: true });
  },
);

/** DELETE — delete folder */
export const DELETE = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { folderId } = await params;
    const id = parseFolderId(folderId);
    const user = await requireUser();

    await vocab.deleteMyFolder(user.uid, id);
    return ok({ deleted: true });
  },
);

/** POST — share folder */
export const POST = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { folderId } = await params;
    const id = parseFolderId(folderId);
    const user = await requireUser();

    await vocab.shareMyFolder(user.uid, id);
    return ok({ shared: true });
  },
);
