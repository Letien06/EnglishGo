package com.englishwebapp.service;

import com.englishwebapp.dto.DraftAnswerResponse;
import com.englishwebapp.dto.PracticeAnswerRequest;
import com.englishwebapp.dto.PracticeSubmissionRequest;
import com.englishwebapp.dto.PracticeSubmissionResponse;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.DraftAnswer;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserAnswer;
import com.englishwebapp.entity.UserAttempt;
import com.englishwebapp.repository.AcceptedAnswerRepository;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.DraftAnswerRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserAnswerRepository;
import com.englishwebapp.repository.UserAttemptRepository;
import com.englishwebapp.repository.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class PracticeSubmissionService {

    private final UserRepository userRepository;
    private final TestRepository testRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final AcceptedAnswerRepository acceptedAnswerRepository;
    private final UserAttemptRepository userAttemptRepository;
    private final UserAnswerRepository userAnswerRepository;
    private final DraftAnswerRepository draftAnswerRepository;
    private final AnswerGradingService answerGradingService;

    @Transactional
    public DraftAnswerResponse saveDraft(Long userId, Long testId, String payload) {
        User user = findUser(userId);
        Test test = findTest(testId);
        DraftAnswer draftAnswer = draftAnswerRepository.findByUserIdAndTestId(userId, testId)
                .orElseGet(DraftAnswer::new);
        draftAnswer.setUser(user);
        draftAnswer.setTest(test);
        draftAnswer.setPayload(payload);
        DraftAnswer saved = draftAnswerRepository.saveAndFlush(draftAnswer);
        return new DraftAnswerResponse(saved.getId(), saved.getUpdatedAt());
    }

    @Transactional
    public PracticeSubmissionResponse submit(Long userId, Long testId, PracticeSubmissionRequest request) {
        User user = findUser(userId);
        Test test = findTest(testId);
        List<Question> questions = questionRepository.findByTestIdOrderByPartAscIdAsc(testId);
        if (questions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Test has no questions");
        }

        Map<Long, PracticeAnswerRequest> answersByQuestionId = request.answers().stream()
                .collect(Collectors.toMap(
                        PracticeAnswerRequest::questionId,
                        Function.identity(),
                        (first, ignored) -> first));
        List<Long> questionIds = questions.stream().map(Question::getId).toList();
        Map<Long, List<AnswerOption>> optionsByQuestionId = answerOptionRepository
                .findByQuestionIdInOrderByIdAsc(questionIds)
                .stream()
                .collect(Collectors.groupingBy(option -> option.getQuestion().getId()));
        Map<Long, AnswerOption> optionsById = optionsByQuestionId.values()
                .stream()
                .flatMap(List::stream)
                .collect(Collectors.toMap(AnswerOption::getId, Function.identity()));
        Map<Long, List<AcceptedAnswer>> acceptedByQuestionId = acceptedAnswerRepository
                .findByQuestionIdInOrderByIdAsc(questionIds)
                .stream()
                .collect(Collectors.groupingBy(answer -> answer.getQuestion().getId()));

        UserAttempt attempt = new UserAttempt();
        attempt.setUser(user);
        attempt.setTest(test);
        attempt.setSubmittedAt(Instant.now());
        UserAttempt savedAttempt = userAttemptRepository.save(attempt);

        int correctCount = 0;
        for (Question question : questions) {
            PracticeAnswerRequest submittedAnswer = answersByQuestionId.getOrDefault(
                    question.getId(),
                    new PracticeAnswerRequest(question.getId(), null, null));
            List<AnswerOption> options = optionsByQuestionId.getOrDefault(question.getId(), List.of());
            List<AcceptedAnswer> acceptedAnswers = acceptedByQuestionId.getOrDefault(question.getId(), List.of());
            boolean correct = answerGradingService.isCorrect(submittedAnswer, options, acceptedAnswers);
            if (correct) {
                correctCount++;
            }

            UserAnswer userAnswer = new UserAnswer();
            userAnswer.setAttempt(savedAttempt);
            userAnswer.setQuestion(question);
            userAnswer.setSelectedOption(resolveSelectedOption(question, submittedAnswer, optionsById));
            userAnswer.setTextResponse(submittedAnswer.textResponse());
            userAnswer.setCorrect(correct);
            userAnswerRepository.save(userAnswer);
        }

        BigDecimal score = calculateScore(correctCount, questions.size());
        savedAttempt.setScore(score);
        userAttemptRepository.save(savedAttempt);
        draftAnswerRepository.deleteByUserIdAndTestId(userId, testId);

        return new PracticeSubmissionResponse(savedAttempt.getId(), score, correctCount, questions.size());
    }

    private AnswerOption resolveSelectedOption(
            Question question,
            PracticeAnswerRequest submittedAnswer,
            Map<Long, AnswerOption> optionsById) {
        if (submittedAnswer.selectedOptionId() == null) {
            return null;
        }
        AnswerOption selectedOption = optionsById.get(submittedAnswer.selectedOptionId());
        if (selectedOption == null || !selectedOption.getQuestion().getId().equals(question.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected option does not belong to question");
        }
        return selectedOption;
    }

    private BigDecimal calculateScore(int correctCount, int questionCount) {
        return BigDecimal.valueOf(correctCount)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(questionCount), 2, RoundingMode.HALF_UP);
    }

    private User findUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private Test findTest(Long testId) {
        return testRepository.findById(testId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
    }
}
