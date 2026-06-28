package com.englishwebapp.dto;

import java.math.BigDecimal;

public record DashboardSummary(long completedTests, BigDecimal averageScore) {
}
