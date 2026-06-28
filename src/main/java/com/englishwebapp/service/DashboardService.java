package com.englishwebapp.service;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.repository.UserAttemptRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final UserAttemptRepository userAttemptRepository;

    @Transactional(readOnly = true)
    public DashboardSummary getSummary(Long userId) {
        long completedTests = userAttemptRepository.countByUserIdAndSubmittedAtIsNotNull(userId);
        Double averageScore = userAttemptRepository.findAverageScoreByUserId(userId);
        BigDecimal roundedAverage = BigDecimal.valueOf(averageScore == null ? 0 : averageScore)
                .setScale(2, RoundingMode.HALF_UP);
        return new DashboardSummary(completedTests, roundedAverage);
    }
}
