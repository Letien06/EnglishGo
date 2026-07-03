import { withErrorHandling } from "@/lib/api/handler";
import { BadRequest, ok } from "@/lib/api/response";
import { requireRole } from "@/lib/auth/session";
import { recentMedia, storeMedia, type MediaType } from "@/lib/services/media";

export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  return ok(await recentMedia());
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireRole("ADMIN");
  const form = await req.formData();
  const file = form.get("file");
  const rawType = String(form.get("mediaType") ?? "").toUpperCase();
  if (!(file instanceof File)) {
    throw BadRequest("File upload khong duoc de trong.");
  }
  if (rawType !== "AUDIO" && rawType !== "IMAGE") {
    throw BadRequest("mediaType must be AUDIO or IMAGE");
  }
  return ok(await storeMedia(file, rawType as MediaType, user), { status: 201 });
});
