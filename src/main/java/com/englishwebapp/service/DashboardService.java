package com.englishwebapp.service;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final String PRACTICE_ATTEMPTS = "practiceAttempts";
    private static final String VOCAB_PROGRESS = "vocabProgress";

    private final FirestoreSupport firestoreSupport;

    public DashboardSummary getSummary(String uid) {
        if (!StringUtils.hasText(uid)) {
            return emptySummary();
        }
        List<AttemptDoc> attempts = loadSubmittedAttempts(uid);
        BigDecimal averageScore = averageScore(attempts);
        List<AttemptDoc> recentAttempts = attempts.stream()
                .sorted(Comparator.comparing(AttemptDoc::submittedAt).reversed())
                .limit(7)
                .sorted(Comparator.comparing(AttemptDoc::submittedAt))
                .toList();
        List<String> labels = recentAttempts.stream()
                .map(attempt -> LocalDate.ofInstant(attempt.submittedAt(), ZoneId.systemDefault()).toString())
                .toList();
        List<BigDecimal> scores = recentAttempts.stream()
                .map(AttemptDoc::score)
                .toList();
        return new DashboardSummary(
                attempts.size(),
                averageScore,
                countMasteredWords(uid),
                calculateStreak(attempts),
                labels,
                scores);
    }

    public long countCompletedToday(String uid) {
        if (!StringUtils.hasText(uid)) {
            return 0;
        }
        Instant start = LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant end = LocalDate.now(ZoneId.systemDefault()).plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        return loadSubmittedAttempts(uid).stream()
                .filter(attempt -> !attempt.submittedAt().isBefore(start) && attempt.submittedAt().isBefore(end))
                .count();
    }

    private DashboardSummary emptySummary() {
        return new DashboardSummary(0, BigDecimal.ZERO.setScale(2), 0, 0, List.of(), List.of());
    }

    private List<AttemptDoc> loadSubmittedAttempts(String uid) {
        try {
            return firestoreSupport.await(firestoreSupport.userCollection(uid, PRACTICE_ATTEMPTS).get())
                    .getDocuments()
                    .stream()
                    .map(this::toAttempt)
                    .filter(attempt -> attempt.submittedAt() != null)
                    .toList();
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load dashboard attempts", ex);
        }
    }

    private long countMasteredWords(String uid) {
        try {
            return firestoreSupport.await(firestoreSupport.userCollection(uid, VOCAB_PROGRESS).get())
                    .getDocuments()
                    .stream()
                    .filter(doc -> "MASTERED".equalsIgnoreCase(stringValue(doc, "status")))
                    .count();
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load vocabulary progress", ex);
        }
    }

    private AttemptDoc toAttempt(DocumentSnapshot doc) {
        return new AttemptDoc(scoreValue(doc), instantValue(doc, "submittedAtMillis", "submittedAt"));
    }

    private BigDecimal averageScore(List<AttemptDoc> attempts) {
        if (attempts.isEmpty()) {
            return BigDecimal.ZERO.setScale(2);
        }
        BigDecimal total = attempts.stream()
                .map(AttemptDoc::score)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(attempts.size()), 2, RoundingMode.HALF_UP);
    }

    private int calculateStreak(List<AttemptDoc> attempts) {
        if (attempts.isEmpty()) {
            return 0;
        }
        List<LocalDate> days = attempts.stream()
                .map(AttemptDoc::submittedAt)
                .map(instant -> LocalDate.ofInstant(instant, ZoneId.systemDefault()))
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

    private BigDecimal scoreValue(DocumentSnapshot doc) {
        Object value = doc.get("score");
        if (value instanceof BigDecimal decimal) {
            return decimal.setScale(2, RoundingMode.HALF_UP);
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue()).setScale(2, RoundingMode.HALF_UP);
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return new BigDecimal(text).setScale(2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO.setScale(2);
    }

    private Instant instantValue(DocumentSnapshot doc, String millisField, String timestampField) {
        Object millis = doc.get(millisField);
        if (millis instanceof Number number) {
            return Instant.ofEpochMilli(number.longValue());
        }
        Object timestamp = doc.get(timestampField);
        if (timestamp instanceof Timestamp firestoreTimestamp) {
            return firestoreTimestamp.toDate().toInstant();
        }
        if (timestamp instanceof Number number) {
            return Instant.ofEpochMilli(number.longValue());
        }
        return null;
    }

    private String stringValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? null : value.toString();
    }

    private record AttemptDoc(BigDecimal score, Instant submittedAt) {
    }
}
