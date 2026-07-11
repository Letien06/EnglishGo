export type DictationLevel = "A2" | "B1" | "B2" | "C1";
export type DictationLessonStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
export type DictationSourceType = "PARTNER_PERMISSION" | "CC_BY" | "PUBLIC_DOMAIN" | "NC_LICENSE" | "OTHER_LICENSE";

export interface DictationLesson {
  id: string;
  status: DictationLessonStatus;
  orderIndex: number;
  title: string;
  slug: string;
  descriptionVi: string | null;
  sourceName: string;
  sourceType: DictationSourceType;
  sourceUrl: string;
  youtubeVideoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  language: "en";
  accent: string | null;
  level: DictationLevel;
  topics: string[];
  segmentCount: number;
  wordCount: number;
  estimatedWpm: number | null;
  transcriptOrigin: string;
  licenseStatus: "PENDING" | "VERIFIED" | "EXPIRED";
  publicAttribution: string;
  rightsId: string | null;
  publishedAtMillis: number | null;
  createdAtMillis: number;
  updatedAtMillis: number;
}

export interface DictationSegment {
  id: string;
  lessonId: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  leadInSeconds: number;
  tailSeconds: number;
  speaker: string | null;
  expectedText: string;
  acceptedNormalizedAnswers: string[];
  translationVi: string | null;
  wordCount: number;
  status: DictationLessonStatus;
  createdAtMillis: number;
  updatedAtMillis: number;
}

export interface DictationProgressSummary {
  lessonId: string;
  lessonTitleSnapshot: string;
  sourceNameSnapshot: string;
  levelSnapshot: DictationLevel;
  segmentCountSnapshot: number;
  completedCount: number;
  masteredCount: number;
  lastSegmentIndex: number;
  lastMaskPercent: 30 | 50 | 100;
  startedAtMillis: number;
  lastStudiedAtMillis: number;
  completedAtMillis: number | null;
  updatedAtMillis: number;
}

export interface DictationSegmentProgress {
  lessonId: string;
  segmentId: string;
  segmentIndex: number;
  attemptCount: number;
  replayCount: number;
  hintCount: number;
  lastMaskPercent: 30 | 50 | 100;
  highestPassedMaskPercent: 0 | 30 | 50 | 100;
  lastScorePercent: number;
  lastAnswer: string | null;
  completedAtMillis: number | null;
  masteredAtMillis: number | null;
  lastStudiedAtMillis: number;
  updatedAtMillis: number;
}

export type DictationPromptToken =
  | { kind: "text" | "space" | "punct"; value: string }
  | { kind: "blank"; blankId: string; length: number; hint: string };

export interface DictationPrompt {
  segmentId: string;
  maskPercent: 30 | 50 | 100;
  inputMode: "BLANKS" | "FULL_TEXT";
  prompt: DictationPromptToken[];
}

export interface DictationAttemptRequest {
  maskPercent: 30 | 50 | 100;
  blankAnswers: Record<string, string> | null;
  fullAnswer: string | null;
  replayCount: number;
  hintCount: number;
  elapsedSeconds: number;
}

export interface DictationFeedbackToken {
  value: string;
  state: "CORRECT" | "MISSING" | "WRONG" | "EXTRA";
}

export interface DictationAttemptResult {
  saved: boolean;
  authenticated: boolean;
  scorePercent: number;
  isCompleted: boolean;
  isMastered: boolean;
  feedbackTokens: DictationFeedbackToken[];
  expectedText: string;
  nextRecommendedMaskPercent: 30 | 50 | 100;
}

export interface TranscriptCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}
