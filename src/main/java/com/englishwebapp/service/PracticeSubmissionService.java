package com.englishwebapp.service;

import com.englishwebapp.dto.DraftAnswerResponse;
import com.englishwebapp.dto.PracticeAnswerRequest;
import com.englishwebapp.dto.PracticeSubmissionRequest;
import com.englishwebapp.dto.PracticeSubmissionResponse;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.service.DauToeicPracticeContentService.PracticeContent;
import com.englishwebapp.service.firestore.FirestorePracticeStore;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class PracticeSubmissionService {

    private final DauToeicPracticeContentService contentService;
    private final FirestorePracticeStore practiceStore;
    private final CommunityService communityService;

    public DraftAnswerResponse saveDraft(String uid, Long testId, String payload) {
        requireUid(uid);
        FirestorePracticeStore.DraftSnapshot draft = practiceStore.saveDraft(uid, testId, payload);
        return new DraftAnswerResponse(draft.id(), draft.updatedAt());
    }

    public PracticeSubmissionResponse submit(String uid, Long testId, PracticeSubmissionRequest request) {
        requireUid(uid);
        PracticeContent content = contentService.loadContent(testId);
        if (content.questions().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Test has no questions");
        }

        Map<Long, PracticeAnswerRequest> answersByQuestionId = request.answers().stream()
                .collect(Collectors.toMap(
                        PracticeAnswerRequest::questionId,
                        Function.identity(),
                        (first, ignored) -> first));

        int correctCount = 0;
        List<Map<String, Object>> answerDocs = new java.util.ArrayList<>();
        for (Question question : content.questions()) {
            PracticeAnswerRequest submitted = answersByQuestionId.getOrDefault(
                    question.getId(),
                    new PracticeAnswerRequest(question.getId(), null, null));
            String selectedAnswer = contentService.optionLetter(submitted.selectedOptionId());
            String correctAnswer = content.correctAnswerByQuestionId().get(question.getId());
            boolean correct = StringUtils.hasText(correctAnswer) && correctAnswer.equals(selectedAnswer);
            if (correct) {
                correctCount++;
            }
            answerDocs.add(answerDoc(question, submitted, selectedAnswer, correctAnswer, correct,
                    content.optionsByQuestionId().getOrDefault(question.getId(), List.of())));
        }

        BigDecimal score = calculateScore(correctCount, content.questions().size());
        Long attemptId = System.currentTimeMillis();
        Instant submittedAt = Instant.now();
        Map<String, Object> attempt = new LinkedHashMap<>();
        attempt.put("source", "DAUTOEIC");
        attempt.put("attemptId", attemptId);
        attempt.put("testId", testId);
        attempt.put("title", content.test().getTitle());
        attempt.put("type", content.test().getType());
        attempt.put("difficulty", content.test().getDifficulty());
        attempt.put("score", score.doubleValue());
        attempt.put("correctCount", correctCount);
        attempt.put("questionCount", content.questions().size());
        attempt.put("startedAtMillis", submittedAt.toEpochMilli());
        attempt.put("submittedAtMillis", submittedAt.toEpochMilli());
        attempt.put("answers", answerDocs);
        practiceStore.saveAttempt(uid, attemptId, attempt);
        practiceStore.deleteDraft(uid, testId);
        communityService.addScore(stubUser(uid), score);
        return new PracticeSubmissionResponse(attemptId, score, correctCount, content.questions().size());
    }

    private Map<String, Object> answerDoc(
            Question question,
            PracticeAnswerRequest submitted,
            String selectedAnswer,
            String correctAnswer,
            boolean correct,
            List<AnswerOption> options) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("questionId", question.getId());
        data.put("part", question.getPart());
        data.put("questionText", question.getContent());
        data.put("explanation", question.getExplanation());
        data.put("selectedOptionId", submitted.selectedOptionId());
        data.put("selectedAnswer", selectedAnswer);
        data.put("correctAnswer", correctAnswer);
        data.put("correct", correct);
        data.put("textResponse", submitted.textResponse());
        data.put("options", options.stream().map(option -> {
            Map<String, Object> optionDoc = new LinkedHashMap<>();
            optionDoc.put("id", option.getId());
            optionDoc.put("content", option.getContent());
            optionDoc.put("correct", Boolean.TRUE.equals(option.getCorrect()));
            return optionDoc;
        }).toList());
        return data;
    }

    private BigDecimal calculateScore(int correctCount, int questionCount) {
        return BigDecimal.valueOf(correctCount)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(questionCount), 2, RoundingMode.HALF_UP);
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
}
