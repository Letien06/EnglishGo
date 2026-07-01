package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.repository.AnswerOptionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class QuestionPublishValidatorTest {

    @Mock
    private AnswerOptionRepository answerOptionRepository;

    @Test
    void rejectsQuestionWithoutCorrectAnswer() {
        Question question = baseQuestion();
        question.setId(10L);
        when(answerOptionRepository.existsByQuestionIdAndCorrectTrue(10L)).thenReturn(false);

        QuestionPublishValidator validator = new QuestionPublishValidator(answerOptionRepository);

        assertThatThrownBy(() -> validator.validateQuestion(question))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("đáp án đúng");
    }

    @Test
    void rejectsListeningPartOneWithoutAudioAndImage() {
        Question question = baseQuestion();
        question.setId(11L);
        question.setSkillType(SkillType.LISTENING);
        question.setPart(1);
        when(answerOptionRepository.existsByQuestionIdAndCorrectTrue(11L)).thenReturn(true);

        QuestionPublishValidator validator = new QuestionPublishValidator(answerOptionRepository);

        assertThatThrownBy(() -> validator.validateQuestion(question))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("audio");
    }

    @Test
    void acceptsReadingPartSixWithPassageGroupAndCorrectAnswer() {
        QuestionGroup group = new QuestionGroup();
        group.setSkillType(SkillType.READING);
        group.setPart(6);
        group.setPassageHtml("<p>Passage</p>");

        Question question = baseQuestion();
        question.setId(12L);
        question.setSkillType(SkillType.READING);
        question.setPart(6);
        question.setGroup(group);
        when(answerOptionRepository.existsByQuestionIdAndCorrectTrue(12L)).thenReturn(true);

        QuestionPublishValidator validator = new QuestionPublishValidator(answerOptionRepository);

        assertThatCode(() -> validator.validateQuestion(question)).doesNotThrowAnyException();
    }

    private Question baseQuestion() {
        Question question = new Question();
        question.setContent("Choose the best answer.");
        question.setDifficultyLevel(3);
        question.setPart(5);
        question.setSkillType(SkillType.READING);
        return question;
    }
}
