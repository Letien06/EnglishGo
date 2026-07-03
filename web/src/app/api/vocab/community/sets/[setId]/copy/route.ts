import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, BadRequest } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

const copySchema = z.object({
  targetSetId: z.coerce.number().int().positive("Target set ID is required"),
});

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { setId } = await params;
    const sourceId = Number(setId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) throw BadRequest("Invalid set ID");

    const user = await requireUser();
    const body = await parseBody(req, copySchema);
    const count = await vocab.copyCommunitySet(user.uid, sourceId, body.targetSetId);
    return ok({ copied: count });
  },
);
