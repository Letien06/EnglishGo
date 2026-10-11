import type { ProgressRequest, ProgressResponse } from "@/types/listening";
import { getCurrentUser } from "@/lib/auth/session";
import { logServerError } from "@/lib/logging";
import { withErrorHandling } from "./handler";
import { ApiError, ok } from "./response";
import { parseBody } from "./validate";
import { progressBatchRequestSchema } from "./learning-tool-validate";

export function learningProgressBatchHandler(
  minPart: number,
  maxPart: number,
  save: (uid: string, request: ProgressRequest) => Promise<ProgressResponse>,
) {
  return withErrorHandling(async (req) => {
    const user = await getCurrentUser();
    if (!user) throw new ApiError("Sign in to sync pending answers", 401);
    const { answers } = await parseBody(req, progressBatchRequestSchema);
    const ids = new Set<string>();
    // Validate the whole envelope before any write, including account ownership.
    for (const answer of answers) {
      if (!answer.requestId || answer.answeredAtMillis == null) throw new ApiError("Missing answer receipt", 400);
      if (answer.expectedUid !== user.uid) throw new ApiError("Learner session changed", 403);
      if (ids.has(answer.requestId)) throw new ApiError("Duplicate answer receipt", 400);
      if (answer.part == null || !Number.isInteger(answer.part) || answer.part < minPart || answer.part > maxPart) throw new ApiError("Invalid part", 400);
      ids.add(answer.requestId);
    }
    const results = [];
    // Writes share learner summary documents. Serial transactions avoid lock
    // contention; one HTTP request shares authentication and round-trip overhead.
    for (const answer of answers) {
      try {
        results.push({ requestId: answer.requestId, status: 200, response: await save(user.uid, answer) });
      } catch (error) {
        if (!(error instanceof ApiError)) logServerError("learning-progress-batch-save", error, { requestId: answer.requestId, part: answer.part });
        results.push({ requestId: answer.requestId, status: error instanceof ApiError ? error.status : 503 });
      }
    }
    return ok({ results });
  });
}
