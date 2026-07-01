package com.englishwebapp.controller;

import com.englishwebapp.dto.AdminContentImportResult;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.repository.TestQuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.AdminContentGenerationService;
import com.englishwebapp.service.AdminContentImportService;
import com.englishwebapp.service.AdminTestAssemblyService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequiredArgsConstructor
public class AdminAutomationController {

    private static final PageRequest RECENT_TESTS = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "id"));

    private final AdminContentGenerationService generationService;
    private final AdminContentImportService importService;
    private final AdminTestAssemblyService testAssemblyService;
    private final TestRepository testRepository;
    private final TestQuestionRepository testQuestionRepository;

    @GetMapping("/admin/ai-import")
    public String aiImport() {
        return "admin/ai-import";
    }

    @PostMapping("/admin/ai-import/generate")
    public String generateQuestions(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "reading") String module,
            @RequestParam(defaultValue = "5") Integer part,
            @RequestParam(required = false) String topic,
            @RequestParam(defaultValue = "5") Integer count,
            @RequestParam(required = false) String licenseNote,
            RedirectAttributes redirectAttributes) {
        AdminContentImportResult result = generationService.generateQuestions(
                principal, module, null, part, topic, count, licenseNote);
        redirectAttributes.addFlashAttribute("adminNotice",
                "Đã tạo " + result.questions() + " câu hỏi AI-style dạng DRAFT trong Question Bank.");
        return "redirect:/admin/question-bank?status=DRAFT";
    }

    @PostMapping("/admin/ai-import/import")
    public String importFile(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "reading") String module,
            @RequestParam(required = false) Long vocabSetId,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String licenseNote,
            @RequestParam MultipartFile file,
            RedirectAttributes redirectAttributes) {
        AdminContentImportResult result = importService.importFile(
                principal, module, null, vocabSetId, topic, licenseNote, file);
        redirectAttributes.addFlashAttribute("adminNotice",
                "Import xong: " + result.questions() + " câu hỏi, "
                        + result.lessons() + " nhóm/passage, " + result.vocabSets() + " bộ từ, "
                        + result.vocabWords() + " từ.");
        if ("vocabulary".equalsIgnoreCase(module)) {
            return "redirect:/admin/ai-import";
        }
        if (result.questions() > 0) {
            return "redirect:/admin/question-bank?status=DRAFT";
        }
        return "redirect:/admin/question-groups";
    }

    @GetMapping("/admin/test-assembly")
    public String testAssembly(Model model) {
        var tests = testRepository.findAll(RECENT_TESTS);
        model.addAttribute("tests", tests);
        model.addAttribute("questionCounts", tests.getContent().stream()
                .collect(java.util.stream.Collectors.toMap(
                        test -> test.getId(),
                        test -> testQuestionRepository.countByTestId(test.getId()))));
        return "admin/test-assembly";
    }

    @PostMapping("/admin/test-assembly")
    public String assembleTest(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam(defaultValue = "120") Integer duration,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "100") Integer listeningCount,
            @RequestParam(defaultValue = "100") Integer readingCount,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            RedirectAttributes redirectAttributes) {
        try {
            var test = testAssemblyService.assembleTest(
                    principal,
                    title,
                    duration,
                    difficulty,
                    listeningCount,
                    readingCount,
                    status);
            redirectAttributes.addFlashAttribute("adminNotice", "Đã ghép đề #" + test.getId() + " từ Question Bank.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/test-assembly";
    }
}
