package com.englishwebapp.service;

import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Lesson;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.LessonRepository;
import com.englishwebapp.repository.QuestionRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LearnerContentService {

    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final LessonRepository lessonRepository;

    @Transactional(readOnly = true)
    public Page<Question> findPublishedQuestions(List<Integer> parts, SkillType skillType, Pageable pageable) {
        return questionRepository.findPublishedLearningQuestions(
                parts,
                skillType,
                ContentStatus.PUBLISHED,
                pageable);
    }

    @Transactional(readOnly = true)
    public Map<Long, List<AnswerOption>> findOptionsByQuestionId(Page<Question> questions) {
        List<Long> questionIds = questions.stream()
                .map(Question::getId)
                .toList();
        if (questionIds.isEmpty()) {
            return Map.of();
        }
        return answerOptionRepository.findByQuestionIdInOrderByIdAsc(questionIds).stream()
                .collect(Collectors.groupingBy(option -> option.getQuestion().getId()));
    }

    @Transactional(readOnly = true)
    public Page<Lesson> findPublishedLessons(Pageable pageable) {
        return lessonRepository.findByStatus(ContentStatus.PUBLISHED, pageable);
    }
}
