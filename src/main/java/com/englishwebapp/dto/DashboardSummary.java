package com.englishwebapp.dto;

import java.math.BigDecimal;
import java.util.List;

public record DashboardSummary(
        long completedTests,
        BigDecimal averageScore,
        long masteredWords,
        int streakDays,
        List<String> scoreLabels,
        List<BigDecimal> scoreValues) {
}
