package com.englishwebapp.service;

import com.englishwebapp.dto.QuestionGroupRequest;
import com.englishwebapp.dto.QuestionGroupResponse;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.repository.QuestionGroupRepository;
import com.englishwebapp.repository.QuestionRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class QuestionGroupService {

    private final QuestionGroupRepository questionGroupRepository;
    private final QuestionRepository questionRepository;
    private final QuestionPublishValidator publishValidator;

    @Transactional(readOnly = true)
    public Page<QuestionGroup> findGroups(SkillType skillType, ToeicPart part, ContentStatus status, Pageable pageable) {
        return questionGroupRepository.findForAdmin(
                skillType,
                part == null ? null : part.number(),
                status,
                pageable);
    }

    @Transactional
    public QuestionGroupResponse createGroup(QuestionGroupRequest request) {
        QuestionGroup group = new QuestionGroup();
        group.setStatus(ContentStatus.DRAFT);
        applyRequest(group, request);
        return toResponse(questionGroupRepository.save(group));
    }

    @Transactional
    public QuestionGroupResponse updateGroup(Long id, QuestionGroupRequest request) {
        QuestionGroup group = questionGroupRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy nhóm câu hỏi."));
        applyRequest(group, request);
        group.setUpdatedAt(Instant.now());
        return toResponse(group);
    }

    @Transactional
    public QuestionGroupResponse publishGroup(Long id) {
        QuestionGroup group = questionGroupRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy nhóm câu hỏi."));
        publishValidator.validateGroup(group);
        group.setStatus(ContentStatus.PUBLISHED);
        group.setPublishedAt(Instant.now());
        return toResponse(group);
    }

    @Transactional
    public QuestionGroupResponse moveGroupToDraft(Long id) {
        QuestionGroup group = questionGroupRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy nhóm câu hỏi."));
        group.setStatus(ContentStatus.DRAFT);
        group.setPublishedAt(null);
        group.setUpdatedAt(Instant.now());
        return toResponse(group);
    }

    @Transactional
    public void deleteGroup(Long id) {
        if (!questionGroupRepository.existsById(id)) {
            throw new IllegalArgumentException("Không tìm thấy nhóm câu hỏi.");
        }
        questionGroupRepository.deleteById(id);
    }

    public QuestionGroupResponse toResponse(QuestionGroup group) {
        return new QuestionGroupResponse(
                group.getId(),
                group.getSkillType(),
                ToeicPart.fromNumber(group.getPart()),
                group.getTitle(),
                group.getDifficultyLevel(),
                group.getPassageHtml(),
                group.getAudioUrl(),
                group.getImageUrl(),
                group.getStatus(),
                group.getId() == null ? 0 : questionRepository.countByGroupId(group.getId()),
                group.getCreatedAt(),
                group.getPublishedAt());
    }

    private void applyRequest(QuestionGroup group, QuestionGroupRequest request) {
        group.setSkillType(request.skillType());
        group.setPart(request.part().number());
        group.setTitle(request.title().trim());
        group.setDifficultyLevel(request.difficultyLevel());
        group.setPassageHtml(blankToNull(request.passageHtml()));
        group.setPassageText(blankToNull(request.passageHtml()));
        group.setAudioUrl(blankToNull(request.audioUrl()));
        group.setImageUrl(blankToNull(request.imageUrl()));
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
