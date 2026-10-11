import { learningProgressBatchHandler } from "@/lib/api/learning-progress-batch";
import { recordProgress } from "@/lib/services/reading";

export const maxDuration = 60;
export const POST = learningProgressBatchHandler(5, 7, recordProgress);
