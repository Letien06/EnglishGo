package com.englishwebapp.service;

import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.repository.AnswerOptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class QuestionPublishValidator {

    private final AnswerOptionRepository answerOptionRepository;

    public void validateQuestion(Question question) {
        if (!StringUtils.hasText(question.getContent())) {
            throw new IllegalStateException("Câu hỏi cần có nội dung trước khi publish.");
        }
        if (question.getDifficultyLevel() == null
                || question.getDifficultyLevel() < 1
                || question.getDifficultyLevel() > 5) {
            throw new IllegalStateException("Độ khó phải nằm trong khoảng 1 đến 5.");
        }
        if (!answerOptionRepository.existsByQuestionIdAndCorrectTrue(question.getId())) {
            throw new IllegalStateException("Câu hỏi cần ít nhất một đáp án đúng trước khi publish.");
        }

        if (question.getSkillType() == SkillType.LISTENING) {
            validateListeningQuestion(question);
        } else if (question.getSkillType() == SkillType.READING) {
            validateReadingQuestion(question);
        }
    }

    public void validateGroup(QuestionGroup group) {
        if (!StringUtils.hasText(group.getTitle())) {
            throw new IllegalStateException("Nhóm câu hỏi cần có tiêu đề.");
        }
        if (group.getDifficultyLevel() != null
                && (group.getDifficultyLevel() < 1 || group.getDifficultyLevel() > 5)) {
            throw new IllegalStateException("Độ khó nhóm phải nằm trong khoảng 1 đến 5.");
        }
        if (group.getSkillType() == SkillType.LISTENING && isListeningGroupPart(group.getPart())) {
            if (!StringUtils.hasText(group.getAudioUrl())) {
                throw new IllegalStateException("Listening Part 3/4 cần audio chung trước khi publish.");
            }
        }
        if (group.getSkillType() == SkillType.READING && isReadingGroupPart(group.getPart())) {
            if (!StringUtils.hasText(group.getPassageHtml())) {
                throw new IllegalStateException("Reading Part 6/7 cần passage trước khi publish.");
            }
        }
    }

    private void validateListeningQuestion(Question question) {
        int part = question.getPart() == null ? 0 : question.getPart();
        if (part == 1) {
            requireText(question.getAudioUrl(), "Listening Part 1 cần audio trước khi publish.");
            requireText(question.getImageUrl(), "Listening Part 1 cần hình ảnh trước khi publish.");
            return;
        }
        if (part == 2) {
            requireText(question.getAudioUrl(), "Listening Part 2 cần audio trước khi publish.");
            return;
        }
        if (isListeningGroupPart(part)) {
            QuestionGroup group = question.getGroup();
            if (group == null) {
                throw new IllegalStateException("Listening Part 3/4 cần nhóm câu hỏi có audio chung.");
            }
            if (group.getSkillType() != SkillType.LISTENING || !Integer.valueOf(part).equals(group.getPart())) {
                throw new IllegalStateException("Nhóm câu hỏi không khớp kỹ năng hoặc part.");
            }
            requireText(group.getAudioUrl(), "Listening Part 3/4 cần audio chung trước khi publish.");
        }
    }

    private void validateReadingQuestion(Question question) {
        int part = question.getPart() == null ? 0 : question.getPart();
        if (isReadingGroupPart(part)) {
            QuestionGroup group = question.getGroup();
            if (group == null) {
                throw new IllegalStateException("Reading Part 6/7 cần nhóm câu hỏi có passage.");
            }
            if (group.getSkillType() != SkillType.READING || !Integer.valueOf(part).equals(group.getPart())) {
                throw new IllegalStateException("Nhóm câu hỏi không khớp kỹ năng hoặc part.");
            }
            requireText(group.getPassageHtml(), "Reading Part 6/7 cần passage trước khi publish.");
        }
    }

    private boolean isListeningGroupPart(Integer part) {
        return Integer.valueOf(3).equals(part) || Integer.valueOf(4).equals(part);
    }

    private boolean isReadingGroupPart(Integer part) {
        return Integer.valueOf(6).equals(part) || Integer.valueOf(7).equals(part);
    }

    private void requireText(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException(message);
        }
    }
}
