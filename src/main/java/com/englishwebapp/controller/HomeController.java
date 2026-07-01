package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.HubService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@RequiredArgsConstructor
public class HomeController {

    private final HubService hubService;

    @GetMapping("/")
    public String home(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        if (user != null) {
            model.addAttribute("hub", hubService.getHub(user));
            return "hub/index";
        }
        return "home";
    }
}
