package com.englishwebapp.service;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.entity.UserAttempt;
import com.englishwebapp.entity.VocabProgressStatus;
import com.englishwebapp.repository.UserAttemptRepository;
import com.englishwebapp.repository.UserVocabProgressRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final UserAttemptRepository userAttemptRepository;
    private final UserVocabProgressRepository userVocabProgressRepository;

    @Transactional(readOnly = true)
    public DashboardSummary getSummary(Long userId) {
        long completedTests = userAttemptRepository.countByUserIdAndSubmittedAtIsNotNull(userId);
        Double averageScore = userAttemptRepository.findAverageScoreByUserId(userId);
        BigDecimal roundedAverage = BigDecimal.valueOf(averageScore == null ? 0 : averageScore)
                .setScale(2, RoundingMode.HALF_UP);
        long masteredWords = userVocabProgressRepository.countByUserIdAndStatus(userId, VocabProgressStatus.MASTERED);
        List<UserAttempt> recentAttempts = new ArrayList<>(
                userAttemptRepository.findTop7ByUserIdAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(userId));
        Collections.reverse(recentAttempts);
        List<String> labels = recentAttempts.stream()
                .map(attempt -> LocalDate.ofInstant(attempt.getSubmittedAt(), ZoneId.systemDefault()).toString())
                .toList();
        List<BigDecimal> scores = recentAttempts.stream().map(UserAttempt::getScore).toList();
        return new DashboardSummary(
                completedTests,
                roundedAverage,
                masteredWords,
                calculateStreak(recentAttempts),
                labels,
                scores);
    }

    private int calculateStreak(List<UserAttempt> attempts) {
        if (attempts.isEmpty()) {
            return 0;
        }
        List<LocalDate> days = attempts.stream()
                .map(attempt -> LocalDate.ofInstant(attempt.getSubmittedAt(), ZoneId.systemDefault()))
                .distinct()
                .sorted(Collections.reverseOrder())
                .toList();
        int streak = 0;
        LocalDate expected = LocalDate.now();
        for (LocalDate day : days) {
            if (day.equals(expected)) {
                streak++;
                expected = expected.minusDays(1);
            } else if (streak == 0 && day.equals(expected.minusDays(1))) {
                streak++;
                expected = day.minusDays(1);
            } else {
                break;
            }
        }
        return streak;
    }
}
