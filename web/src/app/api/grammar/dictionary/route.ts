import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { BadRequest, NotFound, ok } from "@/lib/api/response";
import { isDictionarySelection } from "@/lib/selection-dictionary";
import { lookupGrammarDictionary } from "@/lib/services/grammar-dictionary";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const word = params.get("word")?.trim() ?? "";
  if (!isDictionarySelection(word)) throw BadRequest("Select one English word or a phrase of at most five words.");
  const topicId = params.get("topicId")?.trim() || undefined;
  const questionId = params.get("questionId")?.trim() || undefined;
  if ([topicId, questionId].some(value => value !== undefined && (value.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(value)))) throw BadRequest("Invalid grammar context.");
  const found = await lookupGrammarDictionary(word, { topicId, questionId });
  if (!found) throw NotFound("This selection was not found in the grammar vocabulary.");
  return ok(found, { headers: { "Cache-Control": "public, max-age=60" } });
});
