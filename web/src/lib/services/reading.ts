import { createLearningToolService } from "./learning-tool-service";

const service = createLearningToolService({
  module: "reading",
  minPart: 5,
  maxPart: 7,
  progressCollection: "readingProgress",
  notesCollection: "readingNotes",
  favoritesCollection: "readingFavorites",
  vocabBasketCollection: "readingVocabBasket",
});

export const applyProgress = service.applyProgress;
export const applyProgressBatch = service.applyProgressBatch;
export const summarize = service.summarize;
export const recordProgress = service.recordProgress;
export const saveNote = service.saveNote;
export const toggleFavorite = service.toggleFavorite;
export const addVocab = service.addVocab;
export const resetLevel = service.resetLevel;
