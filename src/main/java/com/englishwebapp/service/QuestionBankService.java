package com.englishwebapp.service;

import com.englishwebapp.dto.AnswerRequest;
import com.englishwebapp.dto.AnswerResponse;
import com.englishwebapp.dto.QuestionCreationRequest;
import com.englishwebapp.dto.QuestionDetailResponse;
import com.englishwebapp.dto.QuestionUpdateRequest;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.QuestionGroupRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class QuestionBankService {

    private final QuestionRepository questionRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final UserRepository userRepository;
    private final QuestionPublishValidator publishValidator;

    @Transactional(readOnly = true)
    public Page<Question> findQuestions(
            SkillType skillType,
            ToeicPart part,
            ContentStatus status,
            Integer difficultyLevel,
            Pageable pageable) {
        return questionRepository.findForQuestionBank(
                skillType,
                part == null ? null : part.number(),
                status,
                difficultyLevel,
                pageable);
    }

    @Transactional(readOnly = true)
    public QuestionDetailResponse getQuestion(Long id) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy câu hỏi."));
        return toResponse(question);
    }

    @Transactional
    public QuestionDetailResponse createQuestion(QuestionCreationRequest request, AppUserPrincipal principal) {
        Question question = new Question();
        question.setStatus(ContentStatus.DRAFT);
        question.setType("MULTIPLE_CHOICE");
        question.setSourceType(SourceType.MANUAL);
        applyRequest(question, request.skillType(), request.part(), request.difficultyLevel(), request.groupId(),
                request.content(), request.audioUrl(), request.imageUrl(), request.explanation());
        Question saved = questionRepository.save(question);
        replaceAnswers(saved, request.answers());
        return toResponse(saved);
    }

    @Transactional
    public QuestionDetailResponse updateQuestion(Long id, QuestionUpdateRequest request, AppUserPrincipal principal) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy câu hỏi."));
        applyRequest(question, request.skillType(), request.part(), request.difficultyLevel(), request.groupId(),
                request.content(), request.audioUrl(), request.imageUrl(), request.explanation());
        question.setUpdatedAt(Instant.now());
        replaceAnswers(question, request.answers());
        return toResponse(question);
    }

    @Transactional
    public QuestionDetailResponse publishQuestion(Long id, AppUserPrincipal principal) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy câu hỏi."));
        publishValidator.validateQuestion(question);
        question.setStatus(ContentStatus.PUBLISHED);
        question.setPublishedAt(Instant.now());
        question.setReviewedAt(Instant.now());
        if (principal != null && principal.id() != null) {
            question.setReviewedBy(userRepository.getReferenceById(principal.id()));
        }
        return toResponse(question);
    }

    @Transactional
    public QuestionDetailResponse moveQuestionToDraft(Long id) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy câu hỏi."));
        question.setStatus(ContentStatus.DRAFT);
        question.setPublishedAt(null);
        question.setReviewedAt(null);
        question.setUpdatedAt(Instant.now());
        return toResponse(question);
    }

    @Transactional
    public void deleteQuestion(Long id) {
        if (!questionRepository.existsById(id)) {
            throw new IllegalArgumentException("Không tìm thấy câu hỏi.");
        }
        questionRepository.deleteById(id);
    }

    public QuestionDetailResponse toResponse(Question question) {
        List<AnswerResponse> answers = question.getId() == null
                ? List.of()
                : answerOptionRepository.findByQuestionIdOrderByIdAsc(question.getId()).stream()
                        .map(option -> new AnswerResponse(
                                option.getId(),
                                option.getContent(),
                                Boolean.TRUE.equals(option.getCorrect())))
                        .toList();
        QuestionGroup group = question.getGroup();
        return new QuestionDetailResponse(
                question.getId(),
                question.getSkillType(),
                ToeicPart.fromNumber(question.getPart()),
                question.getDifficultyLevel(),
                group == null ? null : group.getId(),
                group == null ? null : group.getTitle(),
                question.getContent(),
                question.getAudioUrl(),
                question.getImageUrl(),
                question.getExplanation(),
                question.getStatus(),
                question.getCreatedAt(),
                question.getPublishedAt(),
                answers);
    }

    private void applyRequest(
            Question question,
            SkillType skillType,
            ToeicPart part,
            int difficultyLevel,
            Long groupId,
            String content,
            String audioUrl,
            String imageUrl,
            String explanation) {
        if (difficultyLevel < 1 || difficultyLevel > 5) {
            throw new IllegalArgumentException("Độ khó phải nằm trong khoảng 1 đến 5.");
        }
        question.setSkillType(skillType);
        question.setPart(part.number());
        question.setDifficultyLevel(difficultyLevel);
        question.setContent(content.trim());
        question.setAudioUrl(blankToNull(audioUrl));
        question.setImageUrl(blankToNull(imageUrl));
        question.setExplanation(blankToNull(explanation));
        question.setGroup(resolveGroup(groupId, skillType, part));
    }

    private QuestionGroup resolveGroup(Long groupId, SkillType skillType, ToeicPart part) {
        if (groupId == null) {
            return null;
        }
        QuestionGroup group = questionGroupRepository.findById(groupId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy nhóm câu hỏi."));
        if (group.getSkillType() != skillType || !Integer.valueOf(part.number()).equals(group.getPart())) {
            throw new IllegalArgumentException("Nhóm câu hỏi không khớp kỹ năng hoặc part.");
        }
        return group;
    }

    private void replaceAnswers(Question question, List<AnswerRequest> answers) {
        answerOptionRepository.deleteByQuestionId(question.getId());
        if (answers == null || answers.isEmpty()) {
            return;
        }
        List<AnswerOption> options = answers.stream()
                .filter(answer -> answer != null && StringUtils.hasText(answer.content()))
                .map(answer -> {
                    AnswerOption option = new AnswerOption();
                    option.setQuestion(question);
                    option.setContent(answer.content().trim());
                    option.setCorrect(answer.correct());
                    return option;
                })
                .toList();
        answerOptionRepository.saveAll(options);
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
