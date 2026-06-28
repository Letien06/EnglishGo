package com.englishwebapp.dto;

import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.UserAnswer;
import java.util.List;

public record ReviewAnswerView(
        Question question,
        UserAnswer userAnswer,
        List<AnswerOption> options,
        List<AcceptedAnswer> acceptedAnswers) {
}
