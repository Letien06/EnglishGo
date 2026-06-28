package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.englishwebapp.dto.PracticeAnswerRequest;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import java.util.List;
import org.junit.jupiter.api.Test;

class AnswerGradingServiceTest {

    private final AnswerGradingService answerGradingService = new AnswerGradingService();

    @Test
    void selectedOptionIsCorrectWhenOptionIsMarkedCorrect() {
        AnswerOption correctOption = option(10L, true);
        AnswerOption wrongOption = option(11L, false);

        boolean correct = answerGradingService.isCorrect(
                new PracticeAnswerRequest(1L, 10L, null),
                List.of(correctOption, wrongOption),
                List.of());

        assertThat(correct).isTrue();
    }

    @Test
    void selectedOptionIsIncorrectWhenOptionIsMarkedWrong() {
        AnswerOption wrongOption = option(11L, false);

        boolean correct = answerGradingService.isCorrect(
                new PracticeAnswerRequest(1L, 11L, null),
                List.of(wrongOption),
                List.of());

        assertThat(correct).isFalse();
    }

    @Test
    void textResponseMatchesCaseInsensitiveAcceptedAnswer() {
        AcceptedAnswer acceptedAnswer = acceptedAnswer("hall", false);

        boolean correct = answerGradingService.isCorrect(
                new PracticeAnswerRequest(1L, null, " Hall "),
                List.of(),
                List.of(acceptedAnswer));

        assertThat(correct).isTrue();
    }

    @Test
    void textResponseRespectsCaseSensitiveAcceptedAnswer() {
        AcceptedAnswer acceptedAnswer = acceptedAnswer("IELTS", true);

        boolean correct = answerGradingService.isCorrect(
                new PracticeAnswerRequest(1L, null, "ielts"),
                List.of(),
                List.of(acceptedAnswer));

        assertThat(correct).isFalse();
    }

    private AnswerOption option(Long id, boolean correct) {
        AnswerOption option = new AnswerOption();
        option.setId(id);
        option.setCorrect(correct);
        return option;
    }

    private AcceptedAnswer acceptedAnswer(String answerText, boolean caseSensitive) {
        AcceptedAnswer acceptedAnswer = new AcceptedAnswer();
        acceptedAnswer.setAnswerText(answerText);
        acceptedAnswer.setCaseSensitive(caseSensitive);
        return acceptedAnswer;
    }
}
