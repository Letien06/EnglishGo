/**
 * PATCH  /api/vocab/my-sets/:setId  — rename set
 * DELETE /api/vocab/my-sets/:setId  — delete set
 * POST   /api/vocab/my-sets/:setId  — assign folder / add words / import file
 *
 * Port of VocabularyController my-sets mutation endpoints.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const renameSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("folder"),
    folderId: z.coerce.number().nullable().optional(),
  }),
  z.object({
    action: z.literal("manual"),
    rowsText: z.string().trim().min(1, "Word data is required"),
  }),
]);

function parseSetId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw BadRequest("Invalid set ID");
  }
  return id;
}

/** PATCH — rename */
export const PATCH = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = parseSetId(setId);
    const user = await requireUser();
    const body = await parseBody(req, renameSchema);

    await vocab.renameMySet(user.uid, id, body.title);
    return ok({ success: true });
  },
);

/** DELETE — delete set */
export const DELETE = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = parseSetId(setId);
    const user = await requireUser();

    await vocab.deleteMySet(user.uid, id);
    return ok({ success: true });
  },
);

/**
 * POST — multi-action endpoint
 * Body.action: "folder" | "manual" | "import"
 */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const id = parseSetId(setId);
    const user = await requireUser();

    const contentType = req.headers.get("content-type") ?? "";

    // Handle file import via multipart/form-data
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) throw BadRequest("File is required");

      const buffer = Buffer.from(await file.arrayBuffer());
      const count = await vocab.importWords(user.uid, id, buffer, file.name);
      return ok({ count });
    }

    // Handle JSON actions
    const body = await parseBody(req, actionSchema);

    switch (body.action) {
      case "folder": {
        await vocab.assignMySetToFolder(user.uid, id, body.folderId ?? null);
        return ok({ count: 0 });
      }
      case "manual": {
        const count = await vocab.addManualWords(user.uid, id, body.rowsText);
        return ok({ count });
      }
      default:
        throw BadRequest("Unknown action");
    }
  },
);
