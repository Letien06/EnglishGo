package com.englishwebapp.dto;

import java.math.BigDecimal;
import java.util.List;

public record HubView(
        String greetingName,
        int dailyGoalTarget,
        long dailyGoalCompleted,
        int dailyGoalPercent,
        int streakDays,
        long completedTests,
        BigDecimal averageScore,
        Integer targetScore,
        String level,
        long masteredWords,
        long availableTests,
        long availableQuestions,
        long vocabularyWords,
        List<HubAction> quickActions,
        List<String> scoreLabels,
        List<BigDecimal> scoreValues) {
}
