package com.englishwebapp.service;

import com.englishwebapp.dto.AttemptReviewView;
import com.englishwebapp.dto.PracticeSessionView;
import com.englishwebapp.dto.ReviewAnswerView;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserAnswer;
import com.englishwebapp.entity.UserAttempt;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.service.DauToeicPracticeContentService.PracticeContent;
import com.englishwebapp.service.firestore.FirestorePracticeStore;
import com.google.cloud.firestore.DocumentSnapshot;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class PracticeQueryService {

    private final DauToeicPracticeContentService contentService;
    private final FirestorePracticeStore practiceStore;

    public Page<Test> findTests(String type, String difficulty, Pageable pageable) {
        return contentService.findTests(type, difficulty, pageable);
    }

    public PracticeSessionView getPracticeSession(Long testId, String uid) {
        requireUid(uid);
        PracticeContent content = contentService.loadContent(testId);
        String draftPayload = practiceStore.draftPayload(uid, testId);
        return new PracticeSessionView(
                content.test(),
                List.of(),
                content.questions(),
                content.optionsByQuestionId(),
                draftPayload);
    }

    public AttemptReviewView getAttemptReview(Long attemptId, String uid) {
        requireUid(uid);
        DocumentSnapshot snapshot = practiceStore.getAttempt(uid, attemptId);
        if (!snapshot.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found");
        }
        UserAttempt attempt = toAttempt(snapshot, uid);
        List<ReviewAnswerView> answers = answerDocs(snapshot).stream()
                .map(answer -> toReviewAnswer(attempt, answer))
                .toList();
        return new AttemptReviewView(attempt, answers);
    }

    public Page<UserAttempt> getHistory(String uid, Pageable pageable) {
        requireUid(uid);
        int fetchLimit = (int) Math.min(Integer.MAX_VALUE, pageable.getOffset() + pageable.getPageSize());
        List<UserAttempt> attempts = practiceStore.history(uid, Math.max(fetchLimit, pageable.getPageSize())).stream()
                .map(doc -> toAttempt(doc, uid))
                .toList();
        int start = (int) Math.min(pageable.getOffset(), attempts.size());
        int end = Math.min(start + pageable.getPageSize(), attempts.size());
        return new PageImpl<>(attempts.subList(start, end), pageable, attempts.size());
    }

    private ReviewAnswerView toReviewAnswer(UserAttempt attempt, Map<String, Object> answerDoc) {
        Question question = new Question();
        question.setId(longValue(answerDoc.get("questionId")));
        question.setTest(attempt.getTest());
        question.setPart(intValue(answerDoc.get("part"), 1));
        question.setSkillType(question.getPart() <= 4 ? SkillType.LISTENING : SkillType.READING);
        question.setType("MULTIPLE_CHOICE");
        question.setContent(stringValue(answerDoc.get("questionText"), "Question"));
        question.setExplanation(stringValue(answerDoc.get("explanation"), null));
        question.setStatus(ContentStatus.PUBLISHED);
        question.setSourceType(SourceType.COMMUNITY);

        List<AnswerOption> options = optionDocs(question, answerDoc.get("options"));
        Long selectedOptionId = longValue(answerDoc.get("selectedOptionId"));
        AnswerOption selectedOption = options.stream()
                .filter(option -> option.getId().equals(selectedOptionId))
                .findFirst()
                .orElse(null);

        UserAnswer userAnswer = new UserAnswer();
        userAnswer.setAttempt(attempt);
        userAnswer.setQuestion(question);
        userAnswer.setSelectedOption(selectedOption);
        userAnswer.setTextResponse(stringValue(answerDoc.get("textResponse"), null));
        userAnswer.setCorrect(boolValue(answerDoc.get("correct")));

        AcceptedAnswer acceptedAnswer = new AcceptedAnswer();
        acceptedAnswer.setQuestion(question);
        acceptedAnswer.setAnswerText(stringValue(answerDoc.get("correctAnswer"), ""));
        acceptedAnswer.setCaseSensitive(false);
        return new ReviewAnswerView(question, userAnswer, options, List.of(acceptedAnswer));
    }

    private UserAttempt toAttempt(DocumentSnapshot snapshot, String uid) {
        UserAttempt attempt = new UserAttempt();
        attempt.setId(longValue(snapshot.get("attemptId")));
        attempt.setUser(stubUser(uid));
        attempt.setTest(testFromAttempt(snapshot));
        attempt.setScore(BigDecimal.valueOf(doubleValue(snapshot.get("score"), 0)).setScale(2, java.math.RoundingMode.HALF_UP));
        attempt.setStartedAt(instantValue(snapshot.get("startedAtMillis")));
        attempt.setSubmittedAt(instantValue(snapshot.get("submittedAtMillis")));
        return attempt;
    }

    private Test testFromAttempt(DocumentSnapshot snapshot) {
        Test test = new Test();
        test.setId(longValue(snapshot.get("testId")));
        test.setTitle(stringValue(snapshot.get("title"), "Dau TOEIC test"));
        test.setType(stringValue(snapshot.get("type"), "DAUTOEIC"));
        test.setDifficulty(stringValue(snapshot.get("difficulty"), null));
        test.setDuration(120);
        test.setStatus(ContentStatus.PUBLISHED);
        test.setSourceType(SourceType.COMMUNITY);
        return test;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> answerDocs(DocumentSnapshot snapshot) {
        Object value = snapshot.get("answers");
        if (value instanceof List<?> list) {
            List<Map<String, Object>> answers = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    answers.add((Map<String, Object>) map);
                }
            }
            return answers;
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private List<AnswerOption> optionDocs(Question question, Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<AnswerOption> options = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> optionDoc = (Map<String, Object>) map;
                AnswerOption option = new AnswerOption();
                option.setId(longValue(optionDoc.get("id")));
                option.setQuestion(question);
                option.setContent(stringValue(optionDoc.get("content"), ""));
                option.setCorrect(boolValue(optionDoc.get("correct")));
                options.add(option);
            }
        }
        return options;
    }

    private User stubUser(String uid) {
        User user = new User();
        user.setFirebaseUid(uid);
        user.setEmail(uid + "@firebase.local");
        user.setDisplayName("Learner");
        user.setRole(UserRole.STUDENT);
        return user;
    }

    private void requireUid(String uid) {
        if (!StringUtils.hasText(uid)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.parseLong(text);
        }
        return null;
    }

    private int intValue(Object value, int fallback) {
        Long parsed = longValue(value);
        return parsed == null ? fallback : parsed.intValue();
    }

    private double doubleValue(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Double.parseDouble(text);
        }
        return fallback;
    }

    private boolean boolValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof String text) {
            return Boolean.parseBoolean(text);
        }
        return false;
    }

    private Instant instantValue(Object value) {
        Long millis = longValue(value);
        return millis == null ? null : Instant.ofEpochMilli(millis);
    }

    private String stringValue(Object value, String fallback) {
        return value == null ? fallback : value.toString();
    }
}
