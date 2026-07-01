package com.englishwebapp.controller;

import com.englishwebapp.dto.QuestionGroupRequest;
import com.englishwebapp.dto.QuestionGroupResponse;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.service.QuestionGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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
public class AdminQuestionGroupController {

    private final QuestionGroupService questionGroupService;
    private final QuestionRepository questionRepository;

    @GetMapping("/admin/question-groups")
    public String groups(
            @RequestParam(required = false) SkillType skillType,
            @RequestParam(required = false) ToeicPart part,
            @RequestParam(required = false) ContentStatus status,
            @RequestParam(defaultValue = "0") int page,
            Model model) {
        var groups = questionGroupService.findGroups(
                skillType,
                part,
                status,
                PageRequest.of(Math.max(page, 0), 20));
        model.addAttribute("groups", groups);
        model.addAttribute("questionCounts", groups.getContent().stream()
                .collect(java.util.stream.Collectors.toMap(
                        group -> group.getId(),
                        group -> questionRepository.countByGroupId(group.getId()))));
        model.addAttribute("skillTypes", SkillType.values());
        model.addAttribute("toeicParts", ToeicPart.values());
        model.addAttribute("selectedSkillType", skillType);
        model.addAttribute("selectedPart", part);
        model.addAttribute("selectedStatus", status);
        return "admin/question-groups";
    }

    @PostMapping("/admin/question-groups")
    public String createGroup(
            @RequestParam SkillType skillType,
            @RequestParam ToeicPart part,
            @RequestParam String title,
            @RequestParam(required = false) Integer difficultyLevel,
            @RequestParam(required = false) String passageHtml,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(required = false) String imageUrl,
            RedirectAttributes redirectAttributes) {
        try {
            questionGroupService.createGroup(new QuestionGroupRequest(
                    skillType,
                    part,
                    title,
                    difficultyLevel,
                    passageHtml,
                    audioUrl,
                    imageUrl));
            redirectAttributes.addFlashAttribute("adminNotice", "Đã tạo nhóm câu hỏi.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/question-groups";
    }

    @PostMapping("/admin/question-groups/{id}")
    public String updateGroup(
            @PathVariable Long id,
            @RequestParam SkillType skillType,
            @RequestParam ToeicPart part,
            @RequestParam String title,
            @RequestParam(required = false) Integer difficultyLevel,
            @RequestParam(required = false) String passageHtml,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(required = false) String imageUrl,
            RedirectAttributes redirectAttributes) {
        try {
            questionGroupService.updateGroup(id, new QuestionGroupRequest(
                    skillType,
                    part,
                    title,
                    difficultyLevel,
                    passageHtml,
                    audioUrl,
                    imageUrl));
            redirectAttributes.addFlashAttribute("adminNotice", "Đã cập nhật nhóm câu hỏi.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/question-groups";
    }

    @PostMapping("/admin/question-groups/{id}/publish")
    public String publishGroup(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        try {
            questionGroupService.publishGroup(id);
            redirectAttributes.addFlashAttribute("adminNotice", "Đã publish nhóm câu hỏi.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/question-groups";
    }

    @PostMapping("/admin/question-groups/{id}/draft")
    public String draftGroup(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        questionGroupService.moveGroupToDraft(id);
        redirectAttributes.addFlashAttribute("adminNotice", "Đã chuyển nhóm về draft.");
        return "redirect:/admin/question-groups";
    }

    @PostMapping("/admin/question-groups/{id}/delete")
    public String deleteGroup(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        questionGroupService.deleteGroup(id);
        redirectAttributes.addFlashAttribute("adminNotice", "Đã xóa nhóm câu hỏi.");
        return "redirect:/admin/question-groups";
    }

    @PostMapping("/admin/api/question-groups")
    @ResponseBody
    public QuestionGroupResponse createGroupApi(@Valid @RequestBody QuestionGroupRequest request) {
        return questionGroupService.createGroup(request);
    }

    @PostMapping("/admin/api/question-groups/{id}/publish")
    @ResponseBody
    public QuestionGroupResponse publishGroupApi(@PathVariable Long id) {
        return questionGroupService.publishGroup(id);
    }

    @ModelAttribute("questionStatuses")
    public ContentStatus[] questionStatuses() {
        return new ContentStatus[] {ContentStatus.DRAFT, ContentStatus.PUBLISHED};
    }

    @ModelAttribute("emptyString")
    public String emptyString() {
        return StringUtils.trimWhitespace("");
    }
}
