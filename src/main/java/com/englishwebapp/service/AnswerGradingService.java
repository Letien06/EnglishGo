package com.englishwebapp.service;

import com.englishwebapp.dto.PracticeAnswerRequest;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AnswerGradingService {

    public boolean isCorrect(
            PracticeAnswerRequest submittedAnswer,
            List<AnswerOption> options,
            List<AcceptedAnswer> acceptedAnswers) {
        if (submittedAnswer.selectedOptionId() != null) {
            return options.stream()
                    .anyMatch(option -> option.getId().equals(submittedAnswer.selectedOptionId())
                            && Boolean.TRUE.equals(option.getCorrect()));
        }

        if (!StringUtils.hasText(submittedAnswer.textResponse())) {
            return false;
        }

        String response = submittedAnswer.textResponse().trim();
        return acceptedAnswers.stream()
                .anyMatch(answer -> matchesAcceptedAnswer(response, answer));
    }

    private boolean matchesAcceptedAnswer(String response, AcceptedAnswer acceptedAnswer) {
        String expected = acceptedAnswer.getAnswerText().trim();
        if (Boolean.TRUE.equals(acceptedAnswer.getCaseSensitive())) {
            return response.equals(expected);
        }
        return response.equalsIgnoreCase(expected);
    }
}
