package com.englishwebapp.service;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.dto.HubAction;
import com.englishwebapp.dto.HubView;
import com.englishwebapp.entity.User;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserAttemptRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabWordRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class HubService {

    private static final int DAILY_GOAL_TARGET = 1;

    private final DashboardService dashboardService;
    private final QuestionRepository questionRepository;
    private final TestRepository testRepository;
    private final UserAttemptRepository userAttemptRepository;
    private final UserRepository userRepository;
    private final VocabWordRepository vocabWordRepository;

    @Transactional(readOnly = true)
    public HubView getHub(AppUserPrincipal user) {
        User storedUser = userRepository.findById(user.id()).orElseThrow();
        DashboardSummary summary = dashboardService.getSummary(user.id());
        long todayCompleted = userAttemptRepository.countByUserIdAndSubmittedAtBetween(
                user.id(),
                LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant(),
                LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant());
        int goalPercent = Math.min(100, (int) ((todayCompleted * 100) / DAILY_GOAL_TARGET));

        return new HubView(
                displayName(user),
                DAILY_GOAL_TARGET,
                todayCompleted,
                goalPercent,
                summary.streakDays(),
                summary.completedTests(),
                summary.averageScore(),
                storedUser.getTargetScore(),
                storedUser.getLevel(),
                summary.masteredWords(),
                testRepository.count(),
                questionRepository.count(),
                vocabWordRepository.count(),
                quickActions(),
                summary.scoreLabels(),
                summary.scoreValues());
    }

    private String displayName(AppUserPrincipal user) {
        if (user.displayName() != null && !user.displayName().isBlank()) {
            return user.displayName();
        }
        return user.email();
    }

    private List<HubAction> quickActions() {
        return List.of(
                new HubAction("Listen", "Practice TOEIC listening items from the current question bank.", "/tests", "L", "Practice"),
                new HubAction("Read", "Train reading, grammar, and passage questions.", "/tests", "R", "Practice"),
                new HubAction("Vocabulary", "Review flashcard sets and spaced repetition words.", "/vocab", "V", "Ready"),
                new HubAction("Mock Test", "Start a timed TOEIC-style practice set.", "/tests", "M", "Ready"),
                new HubAction("Wrong", "Review submitted attempts and retry weak questions soon.", "/history", "W", "From history"),
                new HubAction("Starred", "Starred-question queue is tracked for the next practice loop.", "/tests", "S", "Planned"));
    }
}
