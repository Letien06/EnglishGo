import { learningProgressBatchHandler } from "@/lib/api/learning-progress-batch";
import { recordProgress } from "@/lib/services/listening";

export const maxDuration = 60;
export const POST = learningProgressBatchHandler(1, 4, recordProgress);
