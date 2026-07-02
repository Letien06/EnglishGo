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
        populateTests(type, difficulty, pageable, model);
        model.addAttribute("loopMode", "mock");
        model.addAttribute("pageTitle", "De thi TOEIC");
        model.addAttribute("pageSubtitle", "Full tests, mini tests, and part practice");
        return "practice/tests";
    }

    @GetMapping("/starred-practice")
    public String starredPractice(
            @PageableDefault(size = 10) Pageable pageable,
            Model model) {
        populateTests(null, null, pageable, model);
        model.addAttribute("loopMode", "starred");
        model.addAttribute("pageTitle", "Starred practice");
        model.addAttribute("pageSubtitle", "Review saved questions through the practice engine");
        return "practice/tests";
    }

    @GetMapping("/wrong-practice")
    public String wrongPractice(
            @RequestParam(required = false) String difficulty,
            @PageableDefault(size = 10) Pageable pageable,
            Model model) {
        populateTests(null, difficulty, pageable, model);
        model.addAttribute("loopMode", "wrong");
        model.addAttribute("pageTitle", "Wrong answers");
        model.addAttribute("pageSubtitle", "Retry weak questions and recent mistakes");
        return "practice/tests";
    }

    @GetMapping("/random-practice")
    public String randomPractice(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String difficulty,
            @PageableDefault(size = 10) Pageable pageable,
            Model model) {
        populateTests(type, difficulty, pageable, model);
        model.addAttribute("loopMode", "random");
        model.addAttribute("pageTitle", "Random practice");
        model.addAttribute("pageSubtitle", "Choose a set and practice in shuffled mode");
        return "practice/tests";
    }

    private void populateTests(String type, String difficulty, Pageable pageable, Model model) {
        model.addAttribute("tests", practiceQueryService.findTests(type, difficulty, pageable));
        model.addAttribute("type", type);
        model.addAttribute("difficulty", difficulty);
    }

    @GetMapping("/tests/{testId}/practice")
    public String practice(
            @PathVariable Long testId,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        model.addAttribute("session", practiceQueryService.getPracticeSession(testId, user.id()));
        return "practice/session";
    }

    @GetMapping("/practice/session/{testId}")
    public String unifiedPractice(
            @PathVariable Long testId,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        return practice(testId, user, model);
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
