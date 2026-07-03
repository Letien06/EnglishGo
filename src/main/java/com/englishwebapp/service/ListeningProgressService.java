package com.englishwebapp.service;

import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.ListeningProgressRequest;
import com.englishwebapp.dto.ListeningProgressResponse;
import com.englishwebapp.dto.ListeningProgressSummary;
import com.englishwebapp.entity.ListeningProgress;
import com.englishwebapp.service.firestore.FirestoreListeningStore;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class ListeningProgressService {

    private final FirestoreListeningStore listeningStore;

    public List<DauToeicDifficultyLevelResponse> applyProgress(
            String uid,
            List<DauToeicDifficultyLevelResponse> levels) {
        if (!StringUtils.hasText(uid)) {
            return levels;
        }
        return levels.stream()
                .map(level -> {
                    ListeningProgressSummary summary = summarize(uid, level.part(), level.level());
                    int remaining = Math.max(0, nullToZero(level.total()) - summary.done());
                    return new DauToeicDifficultyLevelResponse(
                            level.part(),
                            level.level(),
                            level.title(),
                            level.errorRateMin(),
                            level.errorRateMax(),
                            level.total(),
                            summary.done(),
                            summary.correct(),
                            summary.wrong(),
                            remaining,
                            level.totalAttempts(),
                            level.wrongAttempts());
                })
                .toList();
    }

    public ListeningProgressSummary summarize(String uid, Integer part, Integer level) {
        if (!StringUtils.hasText(uid)) {
            return new ListeningProgressSummary(part, level, 0, 0, 0);
        }
        List<ListeningProgress> rows = listeningStore.findProgressByPartAndLevel(uid, part, level);
        int correct = (int) rows.stream().filter(ListeningProgress::isCorrect).count();
        int wrong = rows.size() - correct;
        long distinctItems = rows.stream().map(ListeningProgress::getItemId).distinct().count();
        return new ListeningProgressSummary(part, level, (int) distinctItems, correct, wrong);
    }

    public ListeningProgressResponse record(String uid, ListeningProgressRequest request) {
        boolean isCorrect = normalize(request.selectedAnswer()).equals(normalize(request.correctAnswer()));
        if (!StringUtils.hasText(uid)) {
            return new ListeningProgressResponse(false, false, isCorrect);
        }
        validate(request);
        ListeningProgress progress = listeningStore.findProgress(uid, request.questionId().trim())
                .orElseGet(ListeningProgress::new);
        progress.setSource("DAUTOEIC");
        progress.setPart(request.part());
        progress.setLevel(request.level());
        progress.setItemId(request.itemId().trim());
        progress.setQuestionId(request.questionId().trim());
        progress.setSelectedAnswer(cleanAnswer(request.selectedAnswer()));
        progress.setCorrectAnswer(cleanAnswer(request.correctAnswer()));
        progress.setCorrect(isCorrect);
        progress.setModeUsed(normalizeMode(request.modeUsed()));
        progress.setAssistPercent(normalizeAssist(request.assistPercent()));
        progress.setReplayCount(request.replayCount() == null ? 0 : Math.max(0, request.replayCount()));
        progress.setElapsedSeconds(request.elapsedSeconds() == null ? 0 : Math.max(0, request.elapsedSeconds()));
        progress.setScore(isCorrect ? request.level() * 10 : 0);
        progress.setCompletedAt(Instant.now());
        listeningStore.saveProgress(uid, progress);
        return new ListeningProgressResponse(true, true, isCorrect);
    }

    private void validate(ListeningProgressRequest request) {
        if (request.part() == null || request.part() < 1 || request.part() > 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Listening part must be between 1 and 4");
        }
        if (request.level() == null || request.level() < 1 || request.level() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Difficulty level must be between 1 and 5");
        }
        if (!StringUtils.hasText(request.itemId()) || !StringUtils.hasText(request.questionId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item and question are required");
        }
    }

    private int nullToZero(Integer value) {
        return value == null ? 0 : value;
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : "";
    }

    private String cleanAnswer(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private String normalizeMode(String mode) {
        return switch (mode == null ? "" : mode) {
            case "bilingual", "fill", "flip" -> mode;
            default -> "normal";
        };
    }

    private int normalizeAssist(Integer assist) {
        if (assist == null) {
            return 30;
        }
        return switch (assist) {
            case 30, 50, 100 -> assist;
            default -> 30;
        };
    }
}
