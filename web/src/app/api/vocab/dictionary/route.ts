import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { BadRequest, NotFound, ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enrichWithDictionary } from "@/lib/services/dictionary";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";

const WORD_PATTERN = /^[A-Za-z][A-Za-z'’\- ]{0,78}$/;

/**
 * Returns one verified entry from Free Dictionary API. Vietnamese meaning and
 * a missing example are derived from that source definition, never guessed
 * from the typed word alone.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const word = new URL(req.url).searchParams.get("word")?.trim() ?? "";
  if (!WORD_PATTERN.test(word)) {
    throw BadRequest("Enter one English word or phrase to look it up");
  }

  const user = await requireUser();
  await enforceDailyActionLimit(user.uid, "vocab-dictionary", 240);

  const [entry] = await enrichWithDictionary([word], 1);
  if (!entry) throw NotFound("This word was not found in the dictionary");

  return ok({
    word: entry.word,
    phonetic: entry.phonetic ?? "",
    phoneticUs: entry.phoneticUs ?? "",
    phoneticUk: entry.phoneticUk ?? "",
    audioUrl: entry.audioUrl ?? "",
    audioUsUrl: entry.audioUsUrl ?? "",
    audioUkUrl: entry.audioUkUrl ?? "",
    meaning: entry.meaning,
    partOfSpeech: entry.partOfSpeech,
    example: entry.example ?? "",
    source: "Free Dictionary API",
  });
});
