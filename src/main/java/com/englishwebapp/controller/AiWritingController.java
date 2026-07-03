package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.AiWritingService;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class AiWritingController {

    private final AiWritingService aiWritingService;

    @GetMapping("/ai/writing")
    public String writing(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        model.addAttribute("jobs", aiWritingService.recentJobs(user.firebaseUid()));
        return "ai/writing";
    }

    @PostMapping("/ai/writing")
    public String submit(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestParam @NotBlank String prompt,
            @RequestParam @NotBlank String responseText) {
        aiWritingService.submit(user.firebaseUid(), prompt, responseText);
        return "redirect:/ai/writing";
    }
}
