import { testPartCatalogHandler } from "@/lib/api/test-part-catalog";
import { applyTestProgress } from "@/lib/services/reading";

export const GET = testPartCatalogHandler(5, 7, applyTestProgress);
