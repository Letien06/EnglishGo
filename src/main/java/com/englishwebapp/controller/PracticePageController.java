package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.PracticeQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class PracticePageController {

    private final PracticeQueryService practiceQueryService;

    @GetMapping({"/tests", "/mock-test"})
    public String tests(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String difficulty,
            @PageableDefault(size = 10) Pageable pageable,
            Model model) {
        model.addAttribute("tests", practiceQueryService.findTests(type, difficulty, pageable));
        model.addAttribute("type", type);
        model.addAttribute("difficulty", difficulty);
        return "practice/tests";
    }

    @GetMapping("/tests/{testId}/practice")
    public String practice(
            @PathVariable Long testId,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        model.addAttribute("session", practiceQueryService.getPracticeSession(testId, user.id()));
        return "practice/session";
    }

    @GetMapping("/attempts/{attemptId}/review")
    public String review(
            @PathVariable Long attemptId,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        model.addAttribute("review", practiceQueryService.getAttemptReview(attemptId, user.id()));
        return "practice/review";
    }

    @GetMapping("/history")
    public String history(
            @AuthenticationPrincipal AppUserPrincipal user,
            @PageableDefault(size = 10) Pageable pageable,
            Model model) {
        model.addAttribute("attempts", practiceQueryService.getHistory(user.id(), pageable));
        return "practice/history";
    }
}
