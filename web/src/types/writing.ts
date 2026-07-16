/**
 * Shared contracts for the original EnglishGo TOEIC Writing practice module.
 *
 * Scores in this module are learning estimates. They are intentionally kept
 * separate from the official TOEIC score scale and are never presented as an
 * ETS result.
 */

export const WRITING_PARTS = [1, 2, 3] as const;
export type WritingPart = (typeof WRITING_PARTS)[number];

export const WRITING_PROMPT_STATUSES = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type WritingPromptStatus = (typeof WRITING_PROMPT_STATUSES)[number];

export const WRITING_DIFFICULTIES = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
] as const;
export type WritingDifficulty = (typeof WRITING_DIFFICULTIES)[number];

/**
 * Part 1 practices a specific pairing of word types. Values stay language-
 * neutral for storage and APIs; the UI can use the exported label map.
 */
export const WRITING_PART_ONE_GRAMMAR_CATEGORIES = [
  "N_N",
  "V_N",
  "N_PREP",
  "V_PREP",
] as const;
export type WritingPartOneGrammarCategory =
  (typeof WRITING_PART_ONE_GRAMMAR_CATEGORIES)[number];

export const WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS: Record<
  WritingPartOneGrammarCategory,
  string
> = {
  N_N: "N + N",
  V_N: "V + N",
  N_PREP: "N + Prep",
  V_PREP: "V + Prep",
};

export type WritingFeedbackProvider = "GEMINI" | "FALLBACK";

export interface WritingResponseRules {
  minWords?: number;
  recommendedWords?: number;
  maxWords?: number;
  minSentences?: number;
  maxSentences?: number;
}

export interface WritingHint {
  title: string;
  body: string;
  /** Hints are progressive: show level 1 before level 2, etc. */
  level: number;
}

export interface WritingSampleAnswer {
  answer: string;
  translationVi: string | null;
  notes: string | null;
}

export interface WritingEmailBrief {
  fromName: string | null;
  toName: string | null;
  subject: string | null;
  body: string | null;
  signature: string | null;
}

export interface WritingRubricCriterion {
  id: string;
  label: string;
  maxScore: number;
  description: string;
}

/** The learner-safe representation returned by the Writing prompt APIs. */
export interface WritingPrompt {
  id: string;
  version: number;
  part: WritingPart;
  status: WritingPromptStatus;
  orderIndex: number;
  title: string;
  titleVi: string;
  summary: string;
  instructions: string;
  promptText: string;
  tags: string[];
  /** Present for Part 1; null for Parts 2/3 and legacy custom prompts. */
  part1Category: WritingPartOneGrammarCategory | null;
  difficulty: WritingDifficulty;
  timeLimitMinutes: number;
  imageUrl: string | null;
  imageAlt: string | null;
  requiredTerms: string[];
  taskChecklist: string[];
  responseRules: WritingResponseRules;
  hints: WritingHint[];
  sampleAnswers: WritingSampleAnswer[];
  planTemplate: string[];
  email: WritingEmailBrief | null;
  rubric: WritingRubricCriterion[];
  sourceLabel: string;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
}

/**
 * Internal authoring fields. `gradingTargets` are intentionally not included
 * in the public `WritingPrompt` response, so they can guide scoring without
 * turning into a hidden answer key in the browser.
 */
export interface WritingGradingTargets {
  topicKeywords: string[];
  requiredIdeas: string[];
}

export interface WritingPromptRecord extends WritingPrompt {
  gradingTargets: WritingGradingTargets;
}

export interface WritingPromptInput {
  part: WritingPart;
  status?: WritingPromptStatus;
  title: string;
  titleVi?: string | null;
  summary?: string | null;
  instructions?: string | null;
  promptText?: string | null;
  tags?: string[];
  part1Category?: WritingPartOneGrammarCategory | null;
  difficulty?: WritingDifficulty;
  timeLimitMinutes?: number;
  imageUrl?: string | null;
  imageAlt?: string | null;
  requiredTerms?: string[];
  taskChecklist?: string[];
  responseRules?: WritingResponseRules;
  hints?: Array<Partial<WritingHint>>;
  sampleAnswers?: Array<Partial<WritingSampleAnswer>>;
  planTemplate?: string[];
  email?: Partial<WritingEmailBrief> | null;
  gradingTargets?: Partial<WritingGradingTargets>;
}

export type WritingPromptUpdateInput = Partial<WritingPromptInput>;

export interface WritingDeterministicCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface WritingDeterministicChecks {
  wordCount: number;
  sentenceCount: number;
  requiredTerms: Array<{ term: string; found: boolean }>;
  checks: WritingDeterministicCheck[];
}

export interface WritingFeedbackCriterion extends WritingRubricCriterion {
  score: number;
  feedback: string;
}

export interface WritingFeedbackIssue {
  title: string;
  explanation: string;
  correction: string | null;
  example: string | null;
}

export interface WritingFeedback {
  /** Always true: this is an educational estimate, not an official score. */
  isEstimate: true;
  disclaimer: string;
  providerStatus: WritingFeedbackProvider;
  score: number;
  maxScore: number;
  summary: string;
  criteria: WritingFeedbackCriterion[];
  deterministicChecks: WritingDeterministicChecks;
  strengths: string[];
  issues: WritingFeedbackIssue[];
  revisedAnswer: string | null;
  nextAction: string;
}

export interface WritingAttempt {
  id: string;
  promptId: string;
  promptPart: WritingPart;
  promptTitle: string;
  promptVersion: number;
  responseText: string;
  wordCount: number;
  elapsedSeconds: number | null;
  usedHintLevels: number[];
  usedSample: boolean;
  feedback: WritingFeedback;
  submittedAtMillis: number;
  createdAtMillis: number | null;
}

export interface WritingAttemptInput {
  promptId: string;
  responseText: string;
  elapsedSeconds?: number | null;
  usedHintLevels?: number[];
  usedSample?: boolean;
}

export interface WritingPromptCatalog {
  items: WritingPrompt[];
  total: number;
  source: "FIRESTORE" | "SEED" | "MIXED";
}

export interface WritingAdminOverview {
  total: number;
  published: number;
  draft: number;
  review: number;
  archived: number;
  byPart: Record<WritingPart, number>;
  lastUpdatedAtMillis: number | null;
}
