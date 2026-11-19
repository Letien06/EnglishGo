import { NextRequest, NextResponse } from "next/server";
import { ApiError, BadRequest } from "@/lib/api/response";
import { logServerError } from "@/lib/logging";
import { acceptSepayWebhook, verifySepayAuthorization } from "@/lib/services/payments";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    verifySepayAuthorization(request.headers.get("authorization"));
    const body = await request.text();
    if (body.length > 32_768) throw BadRequest("Webhook payload too large");
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw BadRequest("Invalid JSON"); }
    await acceptSepayWebhook(payload);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) logServerError("sepay-webhook-failed", "Payment processing failed", { status });
    return NextResponse.json({ success: false }, { status });
  }
}
