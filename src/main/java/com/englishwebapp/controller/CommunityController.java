package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.CommunityService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class CommunityController {

    private final CommunityService communityService;

    @GetMapping("/community")
    public String community(Model model) {
        model.addAttribute("comments", communityService.comments("GENERAL", 1L));
        model.addAttribute("leaderboard", communityService.leaderboard());
        return "community/index";
    }

    @GetMapping("/leaderboard")
    public String leaderboard(@RequestParam(defaultValue = "all-time") String period, Model model) {
        String normalizedPeriod = communityService.normalizePeriod(period);
        model.addAttribute("period", "WEEKLY".equals(normalizedPeriod) ? "weekly" : "all-time");
        model.addAttribute("leaderboard", communityService.leaderboard(normalizedPeriod));
        return "community/leaderboard";
    }

    @PostMapping("/community/comments")
    public String comment(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestParam String content) {
        communityService.addComment(user.id(), "GENERAL", 1L, content);
        return "redirect:/community";
    }
}
