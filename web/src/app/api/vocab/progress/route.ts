/**
 * GET /api/vocab/progress — progress tab data (stats + set cards with progress)
 *
 * Port of VocabularyController progress tab model.
 */
import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";

export const GET = withErrorHandling(async () => {
  const user = await requireUser();

  const uid = user.uid;
  const [
    total,
    learned,
    mastered,
    due,
    studied,
    streak,
    progressSets,
    practiceOptions,
  ] = await Promise.all([
    vocab.totalWords(uid),
    vocab.learnedWords(uid),
    vocab.masteredWords(uid),
    vocab.dueWords(uid),
    vocab.studiedWordsToday(uid),
    vocab.streakDays(uid),
    vocab.findProgressSetCards(uid),
    vocab.findPracticeSetOptions(uid),
  ]);

  return ok({
    totalWords: total,
    learnedWords: learned,
    masteredWords: mastered,
    dueWords: due,
    studiedWordsToday: studied,
    streakDays: streak,
    dailyNewWordGoal: vocab.dailyNewWordGoal(),
    progressSets,
    practiceOptions,
  });
});
