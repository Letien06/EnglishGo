import type { NextRequest } from "next/server";
import { getReadIdentity } from "../auth/session";
import { DAUTOEIC_LEVEL_COUNT } from "../services/dautoeic-source";
import { ApiError, ok } from "./response";
import { withErrorHandling } from "./handler";

export function practiceHistoryHandler(minPart: number, maxPart: number, loadAnswers: (uid: string, part: number, level: number, testId?: string | null) => Promise<Record<string, string>>) {
  return withErrorHandling(async (request: NextRequest) => {
    const part = Number(request.nextUrl.searchParams.get("part"));
    const testId = request.nextUrl.searchParams.get("testId");
    const level = testId ? 1 : Number(request.nextUrl.searchParams.get("level"));
    if (testId !== null && !/^[a-zA-Z0-9_-]{1,200}$/.test(testId)) throw new ApiError("Test không hợp lệ.", 400);
    if (!Number.isInteger(part) || part < minPart || part > maxPart || !Number.isInteger(level) || level < 1 || level > DAUTOEIC_LEVEL_COUNT) {
      throw new ApiError("Phần hoặc cấp luyện tập không hợp lệ.", 400);
    }
    const identity = await getReadIdentity();
    const answers = identity ? await loadAnswers(identity.uid, part, level, testId) : {};
    const response = ok({ uid: identity?.uid ?? null, answers });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
