package com.englishwebapp.dto;

public record AiVocabCandidate(
        String word,
        String meaning,
        String partOfSpeech,
        String phonetic,
        String example,
        String dictionaryDefinition,
        String dictionarySource) {
}
