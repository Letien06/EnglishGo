package com.englishwebapp.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PracticeSubmissionRequest(@NotEmpty List<@Valid PracticeAnswerRequest> answers) {
}
