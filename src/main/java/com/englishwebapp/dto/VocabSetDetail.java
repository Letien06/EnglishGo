package com.englishwebapp.dto;

import com.englishwebapp.entity.VocabSet;
import java.util.List;

public record VocabSetDetail(
        VocabSet set,
        long totalWords,
        long masteredWords,
        long learningWords,
        int progressPercent,
        List<VocabWordRow> words) {
}
