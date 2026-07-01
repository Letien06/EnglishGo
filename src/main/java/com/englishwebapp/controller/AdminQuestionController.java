package com.englishwebapp.controller;

import com.englishwebapp.dto.AnswerRequest;
import com.englishwebapp.dto.QuestionCreationRequest;
import com.englishwebapp.dto.QuestionDetailResponse;
import com.englishwebapp.dto.QuestionUpdateRequest;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.QuestionBankService;
import com.englishwebapp.service.QuestionGroupService;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequiredArgsConstructor
public class AdminQuestionController {

    private final QuestionBankService questionBankService;
    private final QuestionGroupService questionGroupService;
    private final AnswerOptionRepository answerOptionRepository;

    @GetMapping("/admin/question-bank")
    public String questionBank(
            @RequestParam(required = false) SkillType skillType,
            @RequestParam(required = false) ToeicPart part,
            @RequestParam(required = false) ContentStatus status,
            @RequestParam(required = false) Integer difficultyLevel,
            @RequestParam(defaultValue = "0") int page,
            Model model) {
        var questions = questionBankService.findQuestions(
                skillType,
                part,
                status,
                difficultyLevel,
                PageRequest.of(Math.max(page, 0), 20));
        model.addAttribute("questions", questions);
        model.addAttribute("answerCounts", questions.getContent().stream()
                .collect(Collectors.toMap(
                        question -> question.getId(),
                        question -> answerOptionRepository.countByQuestionId(question.getId()))));
        addFilterModel(model, skillType, part, status, difficultyLevel);
        return "admin/question-bank";
    }

    @GetMapping("/admin/question-bank/new")
    public String newQuestion(Model model) {
        populateFormModel(model, null);
        return "admin/question-form";
    }

    @GetMapping("/admin/question-bank/{id}/edit")
    public String editQuestion(@PathVariable Long id, Model model) {
        populateFormModel(model, questionBankService.getQuestion(id));
        return "admin/question-form";
    }

    @PostMapping("/admin/question-bank")
    public String createQuestion(
            @RequestParam Map<String, String> params,
            @RequestParam(defaultValue = "draft") String action,
            @AuthenticationPrincipal AppUserPrincipal principal,
            RedirectAttributes redirectAttributes) {
        try {
            QuestionDetailResponse created = questionBankService.createQuestion(toCreationRequest(params), principal);
            if ("publish".equals(action)) {
                questionBankService.publishQuestion(created.id(), principal);
            }
            redirectAttributes.addFlashAttribute("adminNotice", "Đã lưu câu hỏi.");
            return "redirect:/admin/question-bank";
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
            return "redirect:/admin/question-bank/new";
        }
    }

    @PostMapping("/admin/question-bank/{id}")
    public String updateQuestion(
            @PathVariable Long id,
            @RequestParam Map<String, String> params,
            @RequestParam(defaultValue = "draft") String action,
            @AuthenticationPrincipal AppUserPrincipal principal,
            RedirectAttributes redirectAttributes) {
        try {
            QuestionDetailResponse updated = questionBankService.updateQuestion(id, toUpdateRequest(params), principal);
            if ("publish".equals(action)) {
                questionBankService.publishQuestion(updated.id(), principal);
            }
            redirectAttributes.addFlashAttribute("adminNotice", "Đã cập nhật câu hỏi.");
            return "redirect:/admin/question-bank";
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
            return "redirect:/admin/question-bank/" + id + "/edit";
        }
    }

    @PostMapping("/admin/question-bank/{id}/publish")
    public String publishQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            RedirectAttributes redirectAttributes) {
        try {
            questionBankService.publishQuestion(id, principal);
            redirectAttributes.addFlashAttribute("adminNotice", "Đã publish câu hỏi.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/question-bank";
    }

    @PostMapping("/admin/question-bank/{id}/draft")
    public String draftQuestion(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        questionBankService.moveQuestionToDraft(id);
        redirectAttributes.addFlashAttribute("adminNotice", "Đã chuyển về draft.");
        return "redirect:/admin/question-bank";
    }

    @PostMapping("/admin/question-bank/{id}/delete")
    public String deleteQuestion(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        questionBankService.deleteQuestion(id);
        redirectAttributes.addFlashAttribute("adminNotice", "Đã xóa câu hỏi.");
        return "redirect:/admin/question-bank";
    }

    @PostMapping("/admin/api/questions")
    @ResponseBody
    public QuestionDetailResponse createQuestionApi(
            @Valid @RequestBody QuestionCreationRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return questionBankService.createQuestion(request, principal);
    }

    @PostMapping("/admin/api/questions/{id}")
    @ResponseBody
    public QuestionDetailResponse updateQuestionApi(
            @PathVariable Long id,
            @Valid @RequestBody QuestionUpdateRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return questionBankService.updateQuestion(id, request, principal);
    }

    @PostMapping("/admin/api/questions/{id}/publish")
    @ResponseBody
    public QuestionDetailResponse publishQuestionApi(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return questionBankService.publishQuestion(id, principal);
    }

    @ModelAttribute("questionStatuses")
    public List<ContentStatus> questionStatuses() {
        return List.of(ContentStatus.DRAFT, ContentStatus.PUBLISHED);
    }

    private void addFilterModel(
            Model model,
            SkillType skillType,
            ToeicPart part,
            ContentStatus status,
            Integer difficultyLevel) {
        model.addAttribute("skillTypes", SkillType.values());
        model.addAttribute("toeicParts", ToeicPart.values());
        model.addAttribute("selectedSkillType", skillType);
        model.addAttribute("selectedPart", part);
        model.addAttribute("selectedStatus", status);
        model.addAttribute("selectedDifficulty", difficultyLevel);
    }

    private void populateFormModel(Model model, QuestionDetailResponse question) {
        model.addAttribute("question", question);
        model.addAttribute("skillTypes", SkillType.values());
        model.addAttribute("toeicParts", ToeicPart.values());
        model.addAttribute("groups", questionGroupService.findGroups(null, null, null, PageRequest.of(0, 200)).getContent());
        model.addAttribute("isEdit", question != null);
        if (question != null && question.answers() != null) {
            for (int i = 0; i < Math.min(question.answers().size(), 4); i++) {
                model.addAttribute("answer" + (char) ('A' + i), question.answers().get(i).content());
                if (question.answers().get(i).correct()) {
                    model.addAttribute("correctAnswer", String.valueOf((char) ('A' + i)));
                }
            }
        }
    }

    private QuestionCreationRequest toCreationRequest(Map<String, String> params) {
        return new QuestionCreationRequest(
                SkillType.valueOf(params.getOrDefault("skillType", "LISTENING")),
                ToeicPart.valueOf(params.getOrDefault("part", "PART_1")),
                parseInt(params.get("difficultyLevel"), 3),
                parseLong(params.get("groupId")),
                params.getOrDefault("content", ""),
                params.get("audioUrl"),
                params.get("imageUrl"),
                params.get("explanation"),
                answersFrom(params));
    }

    private QuestionUpdateRequest toUpdateRequest(Map<String, String> params) {
        return new QuestionUpdateRequest(
                SkillType.valueOf(params.getOrDefault("skillType", "LISTENING")),
                ToeicPart.valueOf(params.getOrDefault("part", "PART_1")),
                parseInt(params.get("difficultyLevel"), 3),
                parseLong(params.get("groupId")),
                params.getOrDefault("content", ""),
                params.get("audioUrl"),
                params.get("imageUrl"),
                params.get("explanation"),
                answersFrom(params));
    }

    private List<AnswerRequest> answersFrom(Map<String, String> params) {
        String correct = params.getOrDefault("correctAnswer", "A");
        List<AnswerRequest> answers = new ArrayList<>();
        for (String key : List.of("A", "B", "C", "D")) {
            String content = params.get("answer" + key);
            if (StringUtils.hasText(content)) {
                answers.add(new AnswerRequest(content.trim(), key.equals(correct)));
            }
        }
        return answers;
    }

    private Integer parseInt(String value, int fallback) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        return Integer.parseInt(value);
    }

    private Long parseLong(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return Long.parseLong(value);
    }
}
