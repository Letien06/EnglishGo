import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUserForRead } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUserForRead();
  const url = new URL(req.url);
  const folderIdParam = url.searchParams.get("folderId");
  const folderId = folderIdParam ? Number(folderIdParam) : undefined;
  const search = url.searchParams.get("q") ?? undefined;

  return ok(await vocab.findMyTabCards(
    user.uid,
    Number.isFinite(folderId) ? folderId : undefined,
    search,
  ));
});
