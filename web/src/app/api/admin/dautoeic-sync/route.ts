import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, Unauthorized, ApiError } from "@/lib/api/response";
import { serverEnv } from "@/lib/env";
import { runDauToeicMirrorSync } from "@/lib/services/dautoeic-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  authorizeCron(request);
  const force = request.nextUrl.searchParams.get("force") === "1";
  const result = await runDauToeicMirrorSync({ force });
  return ok(result);
});

export const POST = GET;

function authorizeCron(request: NextRequest): void {
  const secret = serverEnv.cronSecret;
  if (!secret && process.env.NODE_ENV !== "production") {
    return;
  }
  if (!secret) {
    throw new ApiError("Cron secret is not configured", 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(secret))) {
    throw Unauthorized("Unauthorized cron request");
  }
}
