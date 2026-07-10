/**
 * GET /api/listening/levels?part=<num> — enriched difficulty levels for a
 * listening part (content + this user's progress).
 *
 * Used by the client-side dashboard (LevelDashboardClient) so navigating back
 * to /listen reuses a session cache instead of re-rendering the whole Server
 * Component and re-querying on every visit.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, ApiError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as listening from "@/lib/services/listening";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parts = parseParts(url.searchParams.get("parts"));
  if (parts.length > 0) {
    const user = await getCurrentUser();
    const baseGroups = await Promise.all(parts.map(async (part) => ({
      part,
      levels: await dautoeic.listDifficultyLevels(part),
    })));
    const enrichedGroups = await listening.applyProgressBatch(user?.uid ?? null, baseGroups);
    const levelsByPartEntries = enrichedGroups.map((group) =>
      [`part${group.part}`, group.levels] as const,
    );
    return ok({
      levels: levelsByPartEntries[0]?.[1] ?? [],
      levelsByPart: Object.fromEntries(levelsByPartEntries),
    });
  }

  const partParam = url.searchParams.get("part");
  const part = Number.parseInt(partParam ?? "", 10);
  if (Number.isNaN(part) || part < 1 || part > 4) {
    throw new ApiError("Listening part must be between 1 and 4", 400);
  }
  const [user, base] = await Promise.all([
    getCurrentUser(),
    dautoeic.listDifficultyLevels(part),
  ]);
  const levels = await listening.applyProgress(user?.uid ?? null, base);
  return ok({ levels });
});

function parseParts(value: string | null): number[] {
  if (!value?.trim()) return [];
  return [...new Set(
    value
      .split(",")
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isInteger(part) && part >= 1 && part <= 4),
  )].sort((a, b) => a - b);
}
