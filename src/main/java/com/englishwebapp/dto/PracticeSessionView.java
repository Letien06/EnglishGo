package com.englishwebapp.dto;

import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.Test;
import java.util.List;
import java.util.Map;

public record PracticeSessionView(
        Test test,
        List<QuestionGroup> groups,
        List<Question> questions,
        Map<Long, List<AnswerOption>> optionsByQuestionId,
        String draftPayload) {
}
