/**
 * Firestore collection name constants, mapped from `entity/*.java`.
 *
 * Convention: camelCase matching the Java class name (lower-cased first letter).
 * Each Java entity that was previously a JPA @Entity becomes one top-level
 * Firestore collection here.
 */
export const COLLECTIONS = {
  // --- Core user ---
  users: "users",

  // --- Vocabulary ---
  vocabSets: "vocabSets",
  vocabWords: "vocabWords",
  vocabFolders: "vocabFolders",
  userVocabProgress: "userVocabProgress", // VocabProgressStatus tracked per word

  // --- Tests & Practice ---
  tests: "tests",
  dauToeicSets: "dauToeicSets",
  testQuestions: "testQuestions",
  questionGroups: "questionGroups",
  answerOptions: "answerOptions",
  acceptedAnswers: "acceptedAnswers",
  draftAnswers: "draftAnswers",
  userAttempts: "userAttempts",
  userAnswers: "userAnswers",

  // --- Listening ---
  listeningProgress: "listeningProgress",
  listeningNotes: "listeningNotes",
  listeningFavorites: "listeningFavorites",
  listeningVocabBasket: "listeningVocabBasket",
  dictationLessons: "dictationLessons",
  dictationRights: "dictationRights",

  // --- Reading ---
  readingProgress: "readingProgress",
  readingNotes: "readingNotes",
  readingFavorites: "readingFavorites",
  readingVocabBasket: "readingVocabBasket",

  // --- Lessons ---
  lessons: "lessons",

  // --- Community ---
  comments: "comments",
  leaderboardEntries: "leaderboardEntries",

  // --- Content moderation ---
  contentAuditLogs: "contentAuditLogs",

  // --- Media ---
  mediaAssets: "mediaAssets",

  // --- AI ---
  aiWritingJobs: "aiWritingJobs",
} as const;

/** Union type of all collection names */
export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
