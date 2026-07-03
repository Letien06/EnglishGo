package com.englishwebapp.controller;

import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AdminController {

    @GetMapping({
            "/admin",
            "/admin/listening",
            "/admin/reading",
            "/admin/vocabulary",
            "/admin/mock-test",
            "/admin/generate",
            "/admin/content-review"
    })
    public String disabled(Model model) {
        model.addAttribute("metrics", Map.of());
        model.addAttribute("adminDisabled", true);
        return "admin/dashboard";
    }
}
