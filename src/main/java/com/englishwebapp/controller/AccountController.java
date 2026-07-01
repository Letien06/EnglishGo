package com.englishwebapp.controller;

import com.englishwebapp.dto.AccountSettingsForm;
import com.englishwebapp.dto.AccountSettingsView;
import com.englishwebapp.dto.AccountDeviceView;
import com.englishwebapp.dto.PasswordChangeForm;
import com.englishwebapp.entity.User;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;
    private final AuthSessionService authSessionService;

    @GetMapping("/account")
    public String account(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestParam(defaultValue = "profile") String tab,
            HttpServletRequest request,
            Model model) {
        addSettingsModel(user.id(), model, null, null, tab, request);
        return "account/index";
    }

    @PostMapping("/account/profile")
    public String updateAccount(
            @AuthenticationPrincipal AppUserPrincipal user,
            @Valid @ModelAttribute("profileForm") AccountSettingsForm form,
            BindingResult bindingResult,
            HttpServletRequest request,
            RedirectAttributes redirectAttributes,
            Model model) {
        if (bindingResult.hasErrors()) {
            addSettingsModel(user.id(), model, form, null, "profile", request);
            return "account/index";
        }

        User updatedUser = accountService.updateSettings(user.id(), form);
        authSessionService.storeAuthenticatedUser(request, updatedUser);
        redirectAttributes.addFlashAttribute("message", "Da luu thay doi.");
        return "redirect:/account?tab=profile";
    }

    @PostMapping("/account/password")
    public String updatePassword(
            @AuthenticationPrincipal AppUserPrincipal user,
            @Valid @ModelAttribute("passwordForm") PasswordChangeForm passwordForm,
            BindingResult bindingResult,
            HttpServletRequest request,
            RedirectAttributes redirectAttributes,
            Model model) {
        if (bindingResult.hasErrors()) {
            addSettingsModel(user.id(), model, null, passwordForm, "password", request);
            return "account/index";
        }

        try {
            accountService.changePassword(user.id(), passwordForm);
        } catch (ResponseStatusException ex) {
            bindingResult.reject("passwordUpdate", ex.getReason());
            addSettingsModel(user.id(), model, null, passwordForm, "password", request);
            return "account/index";
        }
        redirectAttributes.addFlashAttribute("message", "Da doi mat khau.");
        return "redirect:/account?tab=password";
    }

    private void addSettingsModel(
            Long userId,
            Model model,
            AccountSettingsForm profileFormOverride,
            PasswordChangeForm passwordFormOverride,
            String activeTab,
            HttpServletRequest request) {
        AccountSettingsView settings = accountService.getSettings(userId);
        model.addAttribute("settings", settings);
        model.addAttribute("activeTab", normalizeTab(activeTab));
        model.addAttribute("devices", currentDevices(request));
        if (!model.containsAttribute("profileForm")) {
            model.addAttribute("profileForm", profileFormOverride == null ? settings.form() : profileFormOverride);
        }
        if (!model.containsAttribute("passwordForm")) {
            model.addAttribute("passwordForm", passwordFormOverride == null ? new PasswordChangeForm() : passwordFormOverride);
        }
    }

    private String normalizeTab(String tab) {
        return switch (tab) {
            case "password", "devices" -> tab;
            default -> "profile";
        };
    }

    private List<AccountDeviceView> currentDevices(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        String device = userAgent != null && userAgent.toLowerCase().contains("mobile") ? "mobile" : "desktop";
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("d/M/yyyy"));
        return List.of(new AccountDeviceView(device, today));
    }
}
