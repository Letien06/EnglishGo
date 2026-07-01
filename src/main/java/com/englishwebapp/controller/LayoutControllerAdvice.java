package com.englishwebapp.controller;

import com.englishwebapp.entity.UserRole;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.VocabService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

@ControllerAdvice
@RequiredArgsConstructor
public class LayoutControllerAdvice {

    private final VocabService vocabService;

    @ModelAttribute("shellUser")
    public AppUserPrincipal shellUser(@AuthenticationPrincipal AppUserPrincipal user) {
        return user;
    }

    @ModelAttribute("shellStreakDays")
    public int shellStreakDays(@AuthenticationPrincipal AppUserPrincipal user) {
        if (user == null) {
            return 0;
        }
        try {
            return vocabService.streakDays(user.id());
        } catch (RuntimeException exception) {
            return 0;
        }
    }

    @ModelAttribute("currentPath")
    public String currentPath(HttpServletRequest request) {
        return request.getRequestURI();
    }

    @ModelAttribute("navItems")
    public List<NavItem> navItems(@AuthenticationPrincipal AppUserPrincipal user) {
        List<NavItem> items = new ArrayList<>();
        items.add(new NavItem("Hub", "/hub", "Learn", "H"));
        items.add(new NavItem("Practice", "/tests", "Learn", "P"));
        items.add(new NavItem("Vocabulary", "/vocab", "Learn", "V"));
        items.add(new NavItem("Lessons", "/lessons", "Learn", "L"));
        items.add(new NavItem("History", "/history", "Review", "H"));
        items.add(new NavItem("Community", "/community", "Review", "C"));
        items.add(new NavItem("Writing", "/ai/writing", "Review", "W"));
        if (user != null && user.role() == UserRole.ADMIN) {
            items.add(new NavItem("Admin CMS", "/admin", "Build", "A"));
        } else if (user != null && user.role() == UserRole.TEACHER) {
            items.add(new NavItem("Teacher CMS", "/teacher/cms", "Build", "T"));
        }

        return items;
    }

    public record NavItem(String label, String href, String group, String shortLabel) {
    }
}
