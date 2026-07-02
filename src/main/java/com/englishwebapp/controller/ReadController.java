package com.englishwebapp.controller;

import com.englishwebapp.dto.ListenPartView;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.ReadingProgressService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class ReadController {

    private static final int PRACTICE_SESSION_LIMIT = 20;

    private final DauToeicClientService dauToeicClientService;
    private final ReadingProgressService readingProgressService;

    @GetMapping("/read")
    public String read(
            @RequestParam(defaultValue = "part5") String part,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        if (user == null) {
            return "redirect:/login";
        }
        String activeId = normalizePart(part);
        List<ListenPartView> parts = parts(activeId);
        ListenPartView activePart = parts.stream()
                .filter(ListenPartView::active)
                .findFirst()
                .orElse(parts.get(0));

        model.addAttribute("parts", parts);
        model.addAttribute("activePart", activePart);
        model.addAttribute("readingUserAuthenticated", user != null);
        addDauToeicLevels(activeId, user, model);
        return "read/index";
    }

    @GetMapping("/read/practice")
    public String practice(
            @RequestParam(defaultValue = "5") int part,
            @RequestParam(defaultValue = "1") int level,
            @RequestParam(defaultValue = "normal") String mode,
            @RequestParam(defaultValue = "30") int assist,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        if (user == null) {
            return "redirect:/login";
        }
        String activeId = normalizePracticePart(part);
        List<ListenPartView> parts = parts(activeId);
        ListenPartView activePart = parts.stream()
                .filter(ListenPartView::active)
                .findFirst()
                .orElse(parts.get(1));

        model.addAttribute("parts", parts);
        model.addAttribute("activePart", activePart);
        model.addAttribute("selectedPartNumber", readingPartNumber(activeId));
        model.addAttribute("selectedLevel", normalizeLevel(level));
        model.addAttribute("selectedMode", normalizeMode(mode));
        model.addAttribute("assistPercent", normalizeAssist(assist));
        model.addAttribute("assistOptions", List.of(30, 50, 100));
        model.addAttribute("readingUserAuthenticated", user != null);
        try {
            model.addAttribute("practiceSession", dauToeicClientService.getReadingDifficultySession(
                    readingPartNumber(activeId),
                    normalizeLevel(level),
                    PRACTICE_SESSION_LIMIT));
        } catch (RuntimeException exception) {
            model.addAttribute("dauToeicError", "Khong tai duoc phien luyen doc tu Dau TOEIC.");
        }
        return "read/practice";
    }

    private void addDauToeicLevels(String activeId, AppUserPrincipal user, Model model) {
        if ("grammar".equals(activeId)) {
            return;
        }
        try {
            model.addAttribute("dauToeicReadingLevels", readingProgressService.applyProgress(
                    user == null ? null : user.id(),
                    dauToeicClientService.listReadingDifficultyLevels(readingPartNumber(activeId))));
        } catch (RuntimeException exception) {
            model.addAttribute("dauToeicError", "Khong tai duoc du lieu doc tu Dau TOEIC.");
        }
    }

    private String normalizePart(String part) {
        return switch (part) {
            case "part5", "part6", "part7" -> part;
            default -> "part5";
        };
    }

    private String normalizePracticePart(int part) {
        return switch (part) {
            case 6 -> "part6";
            case 7 -> "part7";
            default -> "part5";
        };
    }

    private int normalizeLevel(int level) {
        return level < 1 || level > 5 ? 1 : level;
    }

    private String normalizeMode(String mode) {
        return switch (mode) {
            case "bilingual", "fill", "flip" -> mode;
            default -> "normal";
        };
    }

    private int normalizeAssist(int assist) {
        return switch (assist) {
            case 30, 50, 100 -> assist;
            default -> 30;
        };
    }

    private int readingPartNumber(String activeId) {
        return switch (activeId) {
            case "part6" -> 6;
            case "part7", "bilingual" -> 7;
            default -> 5;
        };
    }

    private List<ListenPartView> parts(String activeId) {
        return List.of(
                new ListenPartView("part5", "Part 5: Hoàn thành câu", "Part 5: Hoàn thành câu", "Luyện câu hỏi ngữ pháp và từ vựng trong từng câu đơn TOEIC.", "▤", "part5".equals(activeId)),
                new ListenPartView("part6", "Part 6: Hoàn thành đoạn văn", "Part 6: Hoàn thành đoạn văn", "Luyện điền câu, từ và cụm từ theo ngữ cảnh đoạn văn.", "≡", "part6".equals(activeId)),
                new ListenPartView("part7", "Part 7: Đọc hiểu", "Part 7: Đọc hiểu", "Luyện đọc email, thông báo, quảng cáo và bộ nhiều đoạn văn.", "▥", "part7".equals(activeId)),
                new ListenPartView("bilingual", "Đọc song ngữ (demo)", "Đọc song ngữ", "Đọc Anh - Việt theo chủ đề để tăng tốc hiểu ý chính và từ vựng.", "文", "bilingual".equals(activeId)),
                new ListenPartView("grammar", "Ngữ pháp (demo)", "Ngữ pháp TOEIC", "Học theo chủ điểm và luyện theo bộ đề ETS/YBM.", "▥", "grammar".equals(activeId)));
    }

}
