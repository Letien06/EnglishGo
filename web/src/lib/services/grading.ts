export interface GradeAnswer {
  selectedOptionId?: number | null;
  textResponse?: string | null;
}

export interface GradeOption {
  id: number;
  correct?: boolean | null;
}

export interface AcceptedAnswer {
  answerText: string;
  caseSensitive?: boolean | null;
}

export function isCorrect(
  submittedAnswer: GradeAnswer,
  options: GradeOption[],
  acceptedAnswers: AcceptedAnswer[],
): boolean {
  if (submittedAnswer.selectedOptionId != null) {
    return options.some(
      (option) =>
        option.id === submittedAnswer.selectedOptionId && option.correct === true,
    );
  }

  const response = submittedAnswer.textResponse?.trim();
  if (!response) return false;

  return acceptedAnswers.some((answer) => {
    const expected = answer.answerText.trim();
    return answer.caseSensitive
      ? response === expected
      : response.toLowerCase() === expected.toLowerCase();
  });
}
