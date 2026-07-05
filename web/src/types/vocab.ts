/**
 * Vocabulary domain types.
 * Ported from Java entity/DTO classes for the vocab domain.
 */

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export type ContentStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED" | "DELETED";
export type SourceType = "MANUAL" | "AI" | "IMPORT" | "COMMUNITY";
export type VocabProgressStatus = "NEW" | "LEARNING" | "REVIEWING" | "MASTERED";

/* ------------------------------------------------------------------ */
/*  Firestore document shapes                                          */
/* ------------------------------------------------------------------ */

export interface VocabSetDoc {
  id: number;
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
  publishedAtMillis?: number;
  updatedAtMillis?: number;
  deletedAtMillis?: number;
}

export interface VocabWordDoc {
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
  totalWords: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
}

export interface VocabWordCard {
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
  set: { id: number; title: string; topic: string };
  words: VocabWordCard[];
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
