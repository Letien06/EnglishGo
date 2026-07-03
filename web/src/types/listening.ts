/**
 * Type definitions for the Listening domain.
 *
 * Ported from:
 *  - `dto/ListeningProgressRequest.java`
 *  - `dto/ListeningProgressResponse.java`
 *  - `dto/ListeningProgressSummary.java`
 *  - `dto/ListeningToolRequest.java`
 *  - `dto/ListeningToolResponse.java`
 *  - `dto/ListenPartView.java`
 *  - `entity/ListeningProgress.java`
 *  - `entity/ListeningNote.java`
 *  - `entity/ListeningFavorite.java`
 *  - `entity/ListeningVocabBasket.java`
 */

/* ------------------------------------------------------------------ */
/*  Firestore documents (user subcollections)                          */
/* ------------------------------------------------------------------ */

export interface ListeningProgressDoc {
  source: string | null;
  part: number | null;
  level: number | null;
  itemId: string | null;
  questionId: string | null;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  correct: boolean;
  modeUsed: string | null;
  assistPercent: number | null;
  replayCount: number | null;
  elapsedSeconds: number | null;
  score: number | null;
  completedAtMillis: number | null;
}

export interface ListeningNoteDoc {
  itemId: string | null;
  questionId: string | null;
  note: string | null;
  createdAtMillis: number | null;
  updatedAtMillis: number | null;
}

export interface ListeningFavoriteDoc {
  itemId: string | null;
  questionId: string | null;
  part: number | null;
  level: number | null;
  createdAtMillis: number | null;
}

export interface ListeningVocabBasketDoc {
  itemId: string | null;
  questionId: string | null;
  word: string | null;
  normalizedWord: string | null;
  meaning: string | null;
  example: string | null;
  createdAtMillis: number | null;
}

/* ------------------------------------------------------------------ */
/*  API request / response shapes                                      */
/* ------------------------------------------------------------------ */

export interface ProgressRequest {
  part: number | null;
  level: number | null;
  itemId: string | null;
  questionId: string | null;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  modeUsed: string | null;
  assistPercent: number | null;
  replayCount: number | null;
  elapsedSeconds: number | null;
}

export interface ProgressResponse {
  saved: boolean;
  authenticated: boolean;
  correct: boolean;
}

export interface ProgressSummary {
  part: number | null;
  level: number | null;
  done: number;
  correct: number;
  wrong: number;
}

export interface ToolRequest {
  part: number | null;
  level: number | null;
  itemId: string | null;
  questionId: string | null;
  note: string | null;
  word: string | null;
  meaning: string | null;
  example: string | null;
  favorite: boolean | null;
}

export interface ToolResponse {
  saved: boolean;
  authenticated: boolean;
  favorite: boolean | null;
  message: string | null;
}

/* ------------------------------------------------------------------ */
/*  Part view (for dashboard sidebar)                                  */
/* ------------------------------------------------------------------ */

export interface PartView {
  id: string;
  label: string;
  title: string;
  shortDescription: string;
  icon: string;
  active: boolean;
}
