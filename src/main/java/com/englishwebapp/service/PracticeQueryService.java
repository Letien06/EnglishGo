package com.englishwebapp.service;

import com.englishwebapp.dto.AttemptReviewView;
import com.englishwebapp.dto.PracticeSessionView;
import com.englishwebapp.dto.ReviewAnswerView;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.DraftAnswer;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.TestQuestion;
import com.englishwebapp.entity.UserAnswer;
import com.englishwebapp.entity.UserAttempt;
import com.englishwebapp.repository.AcceptedAnswerRepository;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.DraftAnswerRepository;
import com.englishwebapp.repository.QuestionGroupRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.TestQuestionRepository;
import com.englishwebapp.repository.UserAnswerRepository;
import com.englishwebapp.repository.UserAttemptRepository;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class PracticeQueryService {

    private final TestRepository testRepository;
    private final TestQuestionRepository testQuestionRepository;
    private final QuestionRepository questionRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final AcceptedAnswerRepository acceptedAnswerRepository;
    private final DraftAnswerRepository draftAnswerRepository;
    private final UserAttemptRepository userAttemptRepository;
    private final UserAnswerRepository userAnswerRepository;

    @Transactional(readOnly = true)
    public Page<Test> findTests(String type, String difficulty, Pageable pageable) {
        return testRepository.findAll(testFilters(type, difficulty), pageable);
    }

    @Transactional(readOnly = true)
    public PracticeSessionView getPracticeSession(Long testId, Long userId) {
        Test test = testRepository.findByIdAndStatus(testId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        List<Question> questions = testQuestionRepository.findByTestIdOrderByDisplayOrderAscIdAsc(testId)
                .stream()
                .map(TestQuestion::getQuestion)
                .filter(question -> question.getStatus() == ContentStatus.PUBLISHED)
                .toList();
        if (questions.isEmpty()) {
            questions = questionRepository.findByTestIdAndStatusOrderByPartAscIdAsc(testId, ContentStatus.PUBLISHED);
        }
        List<Long> questionIds = questions.stream().map(Question::getId).toList();
        Map<Long, List<AnswerOption>> optionsByQuestionId = answerOptionRepository
                .findByQuestionIdInOrderByIdAsc(questionIds)
                .stream()
                .collect(Collectors.groupingBy(option -> option.getQuestion().getId()));
        String draftPayload = draftAnswerRepository.findByUserIdAndTestId(userId, testId)
                .map(DraftAnswer::getPayload)
                .orElse("{}");

        return new PracticeSessionView(
                test,
                questionGroupRepository.findByTestIdOrderByIdAsc(testId),
                questions,
                optionsByQuestionId,
                draftPayload);
    }

    @Transactional(readOnly = true)
    public AttemptReviewView getAttemptReview(Long attemptId, Long userId) {
        UserAttempt attempt = userAttemptRepository.findByIdAndUserId(attemptId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attempt not found"));
        List<UserAnswer> userAnswers = userAnswerRepository.findByAttemptIdOrderByQuestionPartAscQuestionIdAsc(attemptId);
        List<Long> questionIds = userAnswers.stream()
                .map(answer -> answer.getQuestion().getId())
                .toList();
        Map<Long, List<AnswerOption>> optionsByQuestionId = answerOptionRepository
                .findByQuestionIdInOrderByIdAsc(questionIds)
                .stream()
                .collect(Collectors.groupingBy(option -> option.getQuestion().getId()));
        Map<Long, List<AcceptedAnswer>> acceptedByQuestionId = acceptedAnswerRepository
                .findByQuestionIdInOrderByIdAsc(questionIds)
                .stream()
                .collect(Collectors.groupingBy(answer -> answer.getQuestion().getId()));

        List<ReviewAnswerView> answers = userAnswers.stream()
                .map(answer -> new ReviewAnswerView(
                        answer.getQuestion(),
                        answer,
                        optionsByQuestionId.getOrDefault(answer.getQuestion().getId(), List.of()),
                        acceptedByQuestionId.getOrDefault(answer.getQuestion().getId(), List.of())))
                .toList();
        return new AttemptReviewView(attempt, answers);
    }

    @Transactional(readOnly = true)
    public Page<UserAttempt> getHistory(Long userId, Pageable pageable) {
        return userAttemptRepository.findByUserIdAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(userId, pageable);
    }

    private Specification<Test> testFilters(String type, String difficulty) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (StringUtils.hasText(type)) {
                predicates.add(criteriaBuilder.equal(root.get("type"), type));
            }
            if (StringUtils.hasText(difficulty)) {
                predicates.add(criteriaBuilder.equal(root.get("difficulty"), difficulty));
            }
            predicates.add(criteriaBuilder.equal(root.get("status"), ContentStatus.PUBLISHED));
            return criteriaBuilder.and(predicates.toArray(Predicate[]::new));
        };
    }
}
