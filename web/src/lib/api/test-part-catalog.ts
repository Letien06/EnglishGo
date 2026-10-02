import { getReadIdentity } from "../auth/session";
import { listTestParts, type TestPartCatalogEntry } from "../services/test-part-practice";
import type { DauToeicPartTest } from "@/types/dautoeic";
import { ApiError, ok } from "./response";
import { withErrorHandling } from "./handler";

export function testPartCatalogHandler(minPart: number, maxPart: number, applyProgress: (uid: string | null, entries: TestPartCatalogEntry[]) => Promise<DauToeicPartTest[]>) {
  return withErrorHandling(async (request) => {
    const part = Number(request.nextUrl.searchParams.get("part"));
    if (!Number.isInteger(part) || part < minPart || part > maxPart) throw new ApiError("Part không hợp lệ.", 400);
    const [identity, entries] = await Promise.all([getReadIdentity(), listTestParts(part)]);
    return ok({ uid: identity?.uid ?? null, tests: await applyProgress(identity?.uid ?? null, entries) }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
