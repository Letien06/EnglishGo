package com.englishwebapp.controller;

import com.englishwebapp.dto.QuestionDetailResponse;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.service.QuestionBankService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class UserQuestionController {

    private final QuestionBankService questionBankService;

    @GetMapping("/api/questions")
    public Page<QuestionDetailResponse> questions(
            @RequestParam SkillType skillType,
            @RequestParam ToeicPart part,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50));
        return questionBankService
                .findQuestions(skillType, part, ContentStatus.PUBLISHED, null, pageable)
                .map(questionBankService::toResponse);
    }
}
