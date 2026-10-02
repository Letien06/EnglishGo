import type { NextRequest } from "next/server";
import { getReadIdentity } from "../auth/session";
import { DAUTOEIC_LEVEL_COUNT } from "../services/dautoeic-source";
import { ApiError, ok } from "./response";
import { withErrorHandling } from "./handler";

export function practiceHistoryHandler(minPart: number, maxPart: number, loadAnswers: (uid: string, part: number, level: number) => Promise<Record<string, string>>) {
  return withErrorHandling(async (request: NextRequest) => {
    const part = Number(request.nextUrl.searchParams.get("part"));
    const level = Number(request.nextUrl.searchParams.get("level"));
    if (!Number.isInteger(part) || part < minPart || part > maxPart || !Number.isInteger(level) || level < 1 || level > DAUTOEIC_LEVEL_COUNT) {
      throw new ApiError("Phần hoặc cấp luyện tập không hợp lệ.", 400);
    }
    const identity = await getReadIdentity();
    const answers = identity ? await loadAnswers(identity.uid, part, level) : {};
    const response = ok({ uid: identity?.uid ?? null, answers });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
