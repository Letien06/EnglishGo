import { testPartCatalogHandler } from "@/lib/api/test-part-catalog";
import { applyTestProgress } from "@/lib/services/listening";

export const GET = testPartCatalogHandler(1, 4, applyTestProgress);
