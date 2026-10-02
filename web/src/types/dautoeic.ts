/**
 * Type definitions for the DauToeic external Supabase API.
 *
 * Ported from:
 *  - `dto/DauToeicDifficultyLevelResponse.java`
 *  - `dto/DauToeicDifficultySessionResponse.java`
 *  - `dto/DauToeicPracticeItemResponse.java`
 *  - `dto/DauToeicQuestionResponse.java`
 *  - `dto/DauToeicPassageResponse.java`
 *  - `dto/DauToeicTestResponse.java`
 */

export interface DauToeicDifficultyLevel {
  part: number;
  level: number;
  grouping?: "balanced";
  title: string | null;
  errorRateMin: number | null;
  errorRateMax: number | null;
  total: number | null;
  itemIds: string[];
  done: number;
  correct: number;
  wrong: number;
  remaining: number;
  totalAttempts: number;
  wrongAttempts: number;
}

export interface DauToeicDifficultySession {
  part: number;
  level: number;
  grouping?: "balanced";
  title: string | null;
  total: number;
  items: DauToeicPracticeItem[];
}

export interface DauToeicSet {
  id: string;
  name: string | null;
  description: string | null;
  orderIndex: number | null;
}

export interface DauToeicVocabSet {
  id: string;
  name: string | null;
  orderIndex: number | null;
}

export interface DauToeicVocabTest {
  testId: string;
  setId: string | null;
  name: string | null;
  partCount: number;
  wordCount: number;
  orderIndex: number | null;
  accessLevel: string | null;
}

export interface DauToeicVocabCatalog {
  sets: DauToeicVocabSet[];
  tests: DauToeicVocabTest[];
}

export interface DauToeicVocabPart {
  id: string;
  testId: string | null;
  name: string | null;
  orderIndex: number | null;
}

export interface DauToeicVocabMeaning {
  pos?: string | null;
  part_of_speech?: string | null;
  meaning?: string | null;
  definition?: string | null;
  definition_vi?: string | null;
  example?: string | null;
}

export interface DauToeicVocabWord {
  id: string;
  partId: string | null;
  word: string | null;
  ipa: string | null;
  audioUrl: string | null;
  audioUsUrl: string | null;
  audioUkUrl: string | null;
  imageUrl: string | null;
  meanings: DauToeicVocabMeaning[];
  phrases: unknown[];
  synonyms: unknown[];
  orderIndex: number | null;
  difficultyLevel: number | null;
}

export interface DauToeicVocabPartSummary {
  id: string;
  name: string;
  orderIndex: number | null;
  wordCount: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
  internalSetId: number;
}

export interface DauToeicVocabTestCard {
  id: string;
  internalSetId: number;
  setId: string;
  setName: string;
  title: string;
  orderIndex: number | null;
  accessLevel: string | null;
  partCount: number;
  wordCount: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
}

export interface DauToeicVocabCatalogView {
  groups: Array<{
    id: string;
    name: string;
    orderIndex: number | null;
    count: number;
  }>;
  cards: DauToeicVocabTestCard[];
}

export interface DauToeicPracticeItem {
  id: string;
  itemType: string | null;
  part: number;
  level: number;
  sourceLevel?: number;
  errorRate: number | null;
  totalAttempts: number | null;
  wrongCount: number | null;
  audioUrl: string | null;
  imageUrl: string | null;
  transcript: string | null;
  translation: string | null;
  vocabulary: string | null;
  questions: DauToeicQuestion[];
}

export interface DauToeicQuestion {
  id: string;
  testId: string | null;
  passageId: string | null;
  part: number | null;
  section: string | null;
  questionNumber: number | null;
  audioUrl: string | null;
  imageUrl: string | null;
  passageText: string | null;
  questionText: string | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: string | null;
  explanationVi: string | null;
  explanationEn: string | null;
  difficultyLevel: number | null;
  orderIndex: number | null;
  translationVi: string | null;
  vocabulary: string | null;
  answerTranslationVi: string | null;
}

export interface DauToeicPassage {
  id: string;
  testId: string | null;
  part: number | null;
  passageType: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  passageText: string | null;
  passageText2: string | null;
  passageText3: string | null;
  transcript: string | null;
  orderIndex: number | null;
  title: string | null;
}

export interface DauToeicTest {
  id: string;
  setId: string | null;
  setName: string | null;
  name: string | null;
  description: string | null;
  source: string | null;
  year: number | null;
  difficultyLevel: number | null;
  totalQuestions: number | null;
  listeningDurationSeconds: number | null;
  readingDurationSeconds: number | null;
  isFree: boolean | null;
  isHidden: boolean | null;
  orderIndex: number | null;
  mediaFolder: string | null;
  mediaVersion: number | null;
}

/** Internal stat from the Supabase RPC `get_practice_stats`. */
export interface PracticeStat {
  itemId: string;
  itemType: string | null;
  part: number | null;
  level: number | null;
  totalAttempts: number | null;
  wrongCount: number | null;
  errorRate: number | null;
}
