export interface PublishQuestionInput {
  content?: string | null;
  type?: string | null;
  part?: number | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  options?: { content?: string | null; correct?: boolean | null }[];
  acceptedAnswers?: { answerText?: string | null }[];
}

export interface PublishValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuestionForPublish(
  question: PublishQuestionInput,
): PublishValidationResult {
  const errors: string[] = [];
  const type = question.type?.trim().toUpperCase() || "MULTIPLE_CHOICE";

  if (!question.content?.trim()) {
    errors.push("Question content is required");
  }

  if (!question.part || question.part < 1 || question.part > 7) {
    errors.push("TOEIC part must be between 1 and 7");
  }

  if ((question.part ?? 0) <= 4 && !question.audioUrl?.trim() && !question.imageUrl?.trim()) {
    errors.push("Listening questions need audio or image media");
  }

  if (type === "MULTIPLE_CHOICE") {
    const options = question.options ?? [];
    const filledOptions = options.filter((option) => option.content?.trim());
    const correctCount = filledOptions.filter((option) => option.correct === true).length;
    if (filledOptions.length < 2) {
      errors.push("Multiple-choice questions need at least two answer options");
    }
    if (correctCount !== 1) {
      errors.push("Multiple-choice questions need exactly one correct option");
    }
  } else {
    const acceptedAnswers = question.acceptedAnswers ?? [];
    if (!acceptedAnswers.some((answer) => answer.answerText?.trim())) {
      errors.push("Text-response questions need at least one accepted answer");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
