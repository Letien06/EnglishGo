package com.englishwebapp.service;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.dto.HubAction;
import com.englishwebapp.dto.HubView;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.DocumentSnapshot;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class HubService {

    private static final int DAILY_GOAL_TARGET = 1;

    private final DashboardService dashboardService;
    private final FirestoreSupport firestoreSupport;
    private final VocabService vocabService;

    public HubView getHub(AppUserPrincipal user) {
        String uid = user.firebaseUid();
        Optional<ProfileDoc> profile = loadProfile(uid);
        DashboardSummary summary = dashboardService.getSummary(uid);
        long todayCompleted = dashboardService.countCompletedToday(uid);
        int goalPercent = Math.min(100, (int) ((todayCompleted * 100) / DAILY_GOAL_TARGET));

        return new HubView(
                displayName(user, profile),
                DAILY_GOAL_TARGET,
                todayCompleted,
                goalPercent,
                summary.streakDays(),
                summary.completedTests(),
                summary.averageScore(),
                profile.map(ProfileDoc::targetScore).orElse(null),
                profile.map(ProfileDoc::level).orElse(null),
                summary.masteredWords(),
                0,
                0,
                safeTotalWords(),
                quickActions(),
                summary.scoreLabels(),
                summary.scoreValues());
    }

    private Optional<ProfileDoc> loadProfile(String uid) {
        if (!StringUtils.hasText(uid)) {
            return Optional.empty();
        }
        try {
            DocumentSnapshot snapshot = firestoreSupport.await(firestoreSupport.userDocument(uid).get());
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            return Optional.of(new ProfileDoc(
                    stringValue(snapshot, "displayName"),
                    intValue(snapshot, "targetScore"),
                    stringValue(snapshot, "level")));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private long safeTotalWords() {
        try {
            return vocabService.totalWords();
        } catch (RuntimeException ex) {
            return 0;
        }
    }

    private String displayName(AppUserPrincipal user, Optional<ProfileDoc> profile) {
        String profileName = profile.map(ProfileDoc::displayName).orElse(null);
        if (StringUtils.hasText(profileName)) {
            return profileName;
        }
        if (StringUtils.hasText(user.displayName())) {
            return user.displayName();
        }
        return user.email();
    }

    private List<HubAction> quickActions() {
        return List.of(
                new HubAction("Listen", "Practice TOEIC listening items from the current question bank.", "/listen", "L", "Practice"),
                new HubAction("Read", "Train reading, grammar, and passage questions.", "/read", "R", "Practice"),
                new HubAction("Vocabulary", "Review flashcard sets and spaced repetition words.", "/vocab", "V", "Ready"),
                new HubAction("Mock Test", "Start a timed TOEIC-style practice set.", "/mock-test", "M", "Ready"),
                new HubAction("Wrong", "Review submitted attempts and retry weak questions soon.", "/history", "W", "From history"),
                new HubAction("Starred", "Starred-question queue is tracked for the next practice loop.", "/mock-test", "S", "Planned"));
    }

    private String stringValue(DocumentSnapshot snapshot, String field) {
        Object value = snapshot.get(field);
        return value == null ? null : value.toString();
    }

    private Integer intValue(DocumentSnapshot snapshot, String field) {
        Object value = snapshot.get(field);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Integer.parseInt(text);
        }
        return null;
    }

    private record ProfileDoc(String displayName, Integer targetScore, String level) {
    }
}
