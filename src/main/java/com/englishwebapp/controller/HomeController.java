package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String home(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        model.addAttribute("user", user);
        return "home";
    }
}
