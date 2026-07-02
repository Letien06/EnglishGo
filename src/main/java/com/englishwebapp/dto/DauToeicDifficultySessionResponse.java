package com.englishwebapp.dto;

import java.util.List;

public record DauToeicDifficultySessionResponse(
        Integer part,
        Integer level,
        String title,
        Integer total,
        List<DauToeicPracticeItemResponse> items) {
}
