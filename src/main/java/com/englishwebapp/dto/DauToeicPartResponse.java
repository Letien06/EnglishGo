package com.englishwebapp.dto;

import java.util.List;

public record DauToeicPartResponse(
        DauToeicTestResponse test,
        Integer part,
        String section,
        List<DauToeicPassageResponse> passages,
        List<DauToeicQuestionResponse> questions) {
}
