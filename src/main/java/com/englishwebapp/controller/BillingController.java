package com.englishwebapp.controller;

import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.BillingService;
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
        model.addAttribute("plans", billingService.plans());
        model.addAttribute("subscription", billingService.activeSubscription(user.id()));
        model.addAttribute("transactions", billingService.recentTransactions(user.id()));
        return "billing/index";
    }

    @PostMapping("/billing/checkout")
    public String checkout(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestParam String planId,
            @RequestParam String provider,
            RedirectAttributes redirectAttributes) {
        billingService.checkout(user.id(), planId, provider);
        redirectAttributes.addFlashAttribute("message", "Payment recorded and subscription activated.");
        return "redirect:/billing";
    }
}
