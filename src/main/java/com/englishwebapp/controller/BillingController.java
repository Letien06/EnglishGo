package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.BillingService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;

    @GetMapping("/billing")
    public String billing(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        model.addAttribute("plans", List.of());
        model.addAttribute("subscription", null);
        model.addAttribute("transactions", List.of());
        return "billing/index";
    }

    @PostMapping("/billing/checkout")
    public String checkout(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestParam String planId,
            @RequestParam String provider,
            RedirectAttributes redirectAttributes) {
        redirectAttributes.addFlashAttribute("message", "All learning features are free. Checkout is disabled.");
        return "redirect:/billing";
    }
}
