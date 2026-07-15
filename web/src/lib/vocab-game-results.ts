/**
 * Turns a stream of attempts into one honest result for each vocabulary word.
 * A word answered incorrectly at least once stays in the review bucket even
 * when a later retry succeeds; otherwise the SRS would treat a guessed answer
 * as fully mastered.
 */
export interface VocabGameAttempt {
  id: number;
  correct: boolean;
}

export interface VocabGameOutcome<T extends VocabGameAttempt> {
  answer: T;
  needsReview: boolean;
}

export function consolidateVocabGameAnswers<T extends VocabGameAttempt>(
  answers: T[],
): VocabGameOutcome<T>[] {
  const outcomes = new Map<number, VocabGameOutcome<T>>();

  for (const answer of answers) {
    if (!Number.isInteger(answer?.id) || answer.id <= 0) continue;
    const previous = outcomes.get(answer.id);
    outcomes.set(answer.id, {
      answer,
      needsReview: (previous?.needsReview ?? false) || !answer.correct,
    });
  }

  return [...outcomes.values()];
}
