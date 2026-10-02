/**
 * Vocabulary domain types.
 * Ported from Java entity/DTO classes for the vocab domain.
 */

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export type ContentStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED" | "DELETED";
export type SourceType = "MANUAL" | "AI" | "IMPORT" | "COMMUNITY" | "DAUTOEIC";
export type VocabProgressStatus = "NEW" | "LEARNING" | "REVIEWING" | "MASTERED";

/* ------------------------------------------------------------------ */
/*  Firestore document shapes                                          */
/* ------------------------------------------------------------------ */

export interface VocabSetDoc {
  id: number;
  /** Denormalized count of published words, maintained on every write. */
  wordCount?: number;
  ownerUid?: string;
  ownerName?: string;
  folderId?: number;
  folderName?: string;
  folderPublicShared?: boolean;
  title: string;
  topic: string;
  description?: string;
  icon?: string;
  level?: string;
  status: ContentStatus;
  sourceType: SourceType;
  sourceNote?: string;
  licenseNote?: string;
  externalSource?: string;
  externalSetId?: string;
  externalTestId?: string;
  externalAccessLevel?: string;
  externalPartCount?: number;
  publishedAtMillis?: number;
  updatedAtMillis?: number;
  deletedAtMillis?: number;
}

export interface VocabWordDetails {
  imageUrl?: string;
  exampleTranslation?: string;
  phrases?: { text: string; meaning: string }[];
  synonyms?: string[];
  antonyms?: string[];
  wordFamily?: string[];
  toeicTip?: string;
}

export interface VocabWordDoc extends VocabWordDetails {
  id: number;
  setId: number;
  word: string;
  meaning: string;
  partOfSpeech?: string;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  example?: string;
  audioUrl?: string;
  audioUsUrl?: string;
  audioUkUrl?: string;
  status: ContentStatus;
  sourceType: SourceType;
  sourceNote?: string;
  licenseNote?: string;
  externalSource?: string;
  externalWordId?: string;
  externalPartId?: string;
  externalPartName?: string;
  externalOrderIndex?: number;
  toeicPart?: number | null;
  difficultyLevel?: number | null;
  publishedAtMillis?: number;
  updatedAtMillis?: number;
  deletedAtMillis?: number;
}

export interface VocabFolderDoc {
  id: number;
  ownerUid?: string;
  ownerName?: string;
  name: string;
  publicShared: boolean;
  sharedAtMillis?: number;
  createdAtMillis?: number;
  updatedAtMillis?: number;
  deletedAtMillis?: number;
}

export interface VocabProgressDoc {
  uid: string;
  wordId: number;
  setId: number;
  status: VocabProgressStatus;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAtMillis?: number;
  lastReviewedAtMillis?: number;
}

/* ------------------------------------------------------------------ */
/*  API / View types (ported from Java DTOs)                           */
/* ------------------------------------------------------------------ */

export interface VocabSetCard {
  id: number;
  title: string;
  topic: string;
  icon?: string;
  level?: string;
  wordCount: number;
}

export interface MyVocabSetCard extends VocabSetCard {
  folderId?: number;
  folderName?: string;
}

export interface MyVocabFolderCard {
  id: number;
  name: string;
  publicShared: boolean;
  setCount: number;
}

export interface CommunityVocabFolderCard {
  id: number;
  name: string;
  ownerName?: string;
  setCount: number;
}

export interface CommunityVocabSetCard {
  id: number;
  title: string;
  topic: string;
  wordCount: number;
}

export interface VocabProgressSetCard {
  id: number;
  title: string;
  topic: string;
  icon?: string;
  sourceType?: SourceType;
  externalTestId?: string;
  totalWords: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
}

export interface VocabStudyHistoryDoc {
  id: string;
  uid: string;
  source: "DAUTOEIC" | "LOCAL";
  setId: number;
  externalTestId?: string;
  externalPartId?: string;
  title: string;
  mode: string;
  startedAtMillis: number;
  finishedAtMillis: number;
  totalWords: number;
  correctWords: number;
  wrongWords: number;
  accuracy: number;
  score: number;
}

export interface VocabStudyHistoryCard {
  id: string;
  mode: string;
  time: string;
  accuracy: number;
  score: number;
  totalWords: number;
  correctWords: number;
  wrongWords: number;
}

export interface VocabWordCard extends VocabWordDetails {
  id: number;
  word: string;
  meaning: string;
  partOfSpeech?: string;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  example?: string;
  audioUrl?: string;
  audioUsUrl?: string;
  audioUkUrl?: string;
  externalPartId?: string;
  externalPartName?: string;
  mastered: boolean;
}

export interface VocabSetDetail {
  set: {
    id: number;
    title: string;
    topic: string;
    level?: string;
    ownerUid?: string;
  };
  words: VocabWordCard[];
  totalWords: number;
  masteredWords: number;
  progressPercent: number;
}

export interface VocabSetSession {
  set: {
    id: number;
    title: string;
    topic: string;
    sourceType?: SourceType;
    externalTestId?: string;
    externalPartId?: string;
  };
  words: VocabWordCard[];
  history?: VocabStudyHistoryCard[];
  masteredWords?: number;
  totalWords?: number;
}

export interface AiVocabCandidate {
  word: string;
  meaning: string;
  partOfSpeech: string;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  example?: string;
  audioUrl?: string;
  audioUsUrl?: string;
  audioUkUrl?: string;
  selected?: boolean;
}

export interface VocabReviewResponse {
  wordId: number;
  newStatus: VocabProgressStatus;
  nextReviewAtMillis?: number;
}

export interface GeneratedVocabWord {
  word: string;
  meaning: string;
  partOfSpeech: string;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  example?: string;
  audioUrl?: string;
  audioUsUrl?: string;
  audioUkUrl?: string;
}
