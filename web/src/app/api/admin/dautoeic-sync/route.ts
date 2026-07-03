import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/response";
import { serverEnv } from "@/lib/env";
import { runDauToeicMirrorSync } from "@/lib/services/dautoeic-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.authorized) {
    return fail(auth.message, 401);
  }
  const force = request.nextUrl.searchParams.get("force") === "1";
  const result = await runDauToeicMirrorSync({ force });
  return ok(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}

function authorizeCron(request: NextRequest): { authorized: true } | { authorized: false; message: string } {
  const secret = serverEnv.cronSecret;
  if (!secret && process.env.NODE_ENV !== "production") {
    return { authorized: true };
  }
  if (!secret) {
    return { authorized: false, message: "Cron secret is not configured" };
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization === `Bearer ${secret}`) {
    return { authorized: true };
  }
  return { authorized: false, message: "Unauthorized cron request" };
}
