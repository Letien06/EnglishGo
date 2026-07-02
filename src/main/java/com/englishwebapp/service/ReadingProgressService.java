package com.englishwebapp.service;

import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.ReadingProgressRequest;
import com.englishwebapp.dto.ReadingProgressResponse;
import com.englishwebapp.dto.ReadingProgressSummary;
import com.englishwebapp.entity.ReadingProgress;
import com.englishwebapp.repository.ReadingProgressRepository;
import com.englishwebapp.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class ReadingProgressService {

    private final ReadingProgressRepository readingProgressRepository;
    private final UserRepository userRepository;

    public List<DauToeicDifficultyLevelResponse> applyProgress(
            Long userId,
            List<DauToeicDifficultyLevelResponse> levels) {
        if (userId == null) {
            return levels;
        }
        return levels.stream()
                .map(level -> {
                    ReadingProgressSummary summary = summarize(userId, level.part(), level.level());
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

    public ReadingProgressSummary summarize(Long userId, Integer part, Integer level) {
        if (userId == null) {
            return new ReadingProgressSummary(part, level, 0, 0, 0);
        }
        List<ReadingProgress> rows = readingProgressRepository.findByUserIdAndPartAndLevel(userId, part, level);
        int correct = (int) rows.stream().filter(ReadingProgress::isCorrect).count();
        int wrong = rows.size() - correct;
        long distinctItems = rows.stream().map(ReadingProgress::getItemId).distinct().count();
        return new ReadingProgressSummary(part, level, (int) distinctItems, correct, wrong);
    }

    @Transactional
    public ReadingProgressResponse record(Long userId, ReadingProgressRequest request) {
        boolean isCorrect = normalize(request.selectedAnswer()).equals(normalize(request.correctAnswer()));
        if (userId == null) {
            return new ReadingProgressResponse(false, false, isCorrect);
        }
        validate(request);
        ReadingProgress progress = readingProgressRepository
                .findByUserIdAndQuestionId(userId, request.questionId().trim())
                .orElseGet(ReadingProgress::new);
        if (progress.getUser() == null) {
            progress.setUser(userRepository.findById(userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found")));
        }
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
        progress.setElapsedSeconds(request.elapsedSeconds() == null ? 0 : Math.max(0, request.elapsedSeconds()));
        progress.setScore(isCorrect ? request.level() * 10 : 0);
        progress.setCompletedAt(Instant.now());
        readingProgressRepository.save(progress);
        return new ReadingProgressResponse(true, true, isCorrect);
    }

    private void validate(ReadingProgressRequest request) {
        if (request.part() == null || request.part() < 5 || request.part() > 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reading part must be between 5 and 7");
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
