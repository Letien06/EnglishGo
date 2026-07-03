package com.englishwebapp.controller;

import com.englishwebapp.dto.QuestionDetailResponse;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserQuestionController {

    @GetMapping("/api/questions")
    public Page<QuestionDetailResponse> questions(
            @RequestParam SkillType skillType,
            @RequestParam ToeicPart part,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50));
        return Page.empty(pageable);
    }
}
