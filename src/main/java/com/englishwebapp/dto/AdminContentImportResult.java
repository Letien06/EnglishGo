package com.englishwebapp.dto;

public record AdminContentImportResult(
        int tests,
        int questions,
        int lessons,
        int vocabSets,
        int vocabWords) {

    public int total() {
        return tests + questions + lessons + vocabSets + vocabWords;
    }
}
