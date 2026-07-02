package com.englishwebapp.controller;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabWordRepository;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepository;
    private final QuestionRepository questionRepository;
    private final TestRepository testRepository;
    private final VocabWordRepository vocabWordRepository;

    @GetMapping("/admin")
    public String dashboard(Model model) {
        model.addAttribute("metrics", Map.of(
                "students", userRepository.countByRole(UserRole.STUDENT),
                "teachers", userRepository.countByRole(UserRole.TEACHER),
                "admins", userRepository.countByRole(UserRole.ADMIN),
                "publishedQuestions", questionRepository.countByStatus(ContentStatus.PUBLISHED),
                "draftQuestions", questionRepository.countByStatus(ContentStatus.DRAFT),
                "publishedTests", testRepository.countByStatus(ContentStatus.PUBLISHED),
                "publishedWords", vocabWordRepository.countByStatus(ContentStatus.PUBLISHED)));
        return "admin/dashboard";
    }

    @GetMapping({
            "/admin/listening",
            "/admin/reading",
            "/admin/vocabulary",
            "/admin/mock-test"
    })
    public String contentModules(Model model) {
        model.addAttribute("listeningQuestions", questionRepository.countBySkillType(SkillType.LISTENING));
        model.addAttribute("readingQuestions", questionRepository.countBySkillType(SkillType.READING));
        model.addAttribute("vocabWords", vocabWordRepository.countByStatus(ContentStatus.PUBLISHED));
        model.addAttribute("mockTests", testRepository.countByStatus(ContentStatus.PUBLISHED));
        return "admin/content-modules";
    }

    @GetMapping("/admin/generate")
    public String generate() {
        return "admin/generate";
    }

    @GetMapping("/admin/content-review")
    public String contentReview(Model model) {
        model.addAttribute("draftQuestions", questionRepository.countByStatus(ContentStatus.DRAFT));
        return "admin/content-review";
    }
}
