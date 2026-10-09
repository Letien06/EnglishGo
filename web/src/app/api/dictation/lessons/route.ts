import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import * as dictation from "@/lib/services/dictation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { BadRequest } from "@/lib/api/response";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw BadRequest("Invalid page offset");
  const user = await getCurrentUserForRead();
  const result = await dictation.getCatalogPage(user?.uid ?? null, {
    level: url.searchParams.get("level"), topic: url.searchParams.get("topic"),
    source: url.searchParams.get("source"), duration: url.searchParams.get("duration"),
    query: url.searchParams.get("query")?.slice(0, 200), sort: url.searchParams.get("sort") ?? undefined, offset,
  });
  const response = ok(result);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
