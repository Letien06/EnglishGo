package com.englishwebapp.controller;

import org.springframework.stereotype.Controller;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class ContributionController {

    @GetMapping("/contribute")
    public String contribute() {
        return "community/contribute";
    }

    @PostMapping("/contribute")
    public String submit(
            @RequestParam String title,
            @RequestParam String content,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) Boolean ownsRights,
            RedirectAttributes redirectAttributes) {
        if (!Boolean.TRUE.equals(ownsRights)) {
            redirectAttributes.addFlashAttribute("error", "You must confirm you have the right to share this content.");
            return "redirect:/contribute";
        }
        if (!StringUtils.hasText(title) || !StringUtils.hasText(content)) {
            redirectAttributes.addFlashAttribute("error", "Title and content are required.");
            return "redirect:/contribute";
        }
        redirectAttributes.addFlashAttribute("message", "Submission captured for review workflow setup.");
        return "redirect:/contribute";
    }
}
