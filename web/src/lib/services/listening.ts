import { createLearningToolService } from "./learning-tool-service";

const service = createLearningToolService({
  module: "listening",
  minPart: 1,
  maxPart: 4,
  progressCollection: "listeningProgress",
  notesCollection: "listeningNotes",
  favoritesCollection: "listeningFavorites",
  vocabBasketCollection: "listeningVocabBasket",
});

export const applyProgress = service.applyProgress;
export const applyTestProgress = service.applyTestProgress;
export const applyProgressBatch = service.applyProgressBatch;
export const summarize = service.summarize;
export const loadAnswers = service.loadAnswers;
export const recordProgress = service.recordProgress;
export const saveNote = service.saveNote;
export const toggleFavorite = service.toggleFavorite;
export const addVocab = service.addVocab;
export const resetLevel = service.resetLevel;
