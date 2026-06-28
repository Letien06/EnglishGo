package com.englishwebapp.dto;

import com.englishwebapp.entity.UserAttempt;
import java.util.List;

public record AttemptReviewView(UserAttempt attempt, List<ReviewAnswerView> answers) {
}
