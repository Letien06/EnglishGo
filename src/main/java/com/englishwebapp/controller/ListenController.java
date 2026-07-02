package com.englishwebapp.controller;

import com.englishwebapp.dto.ListenPartView;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.LearnerContentService;
import com.englishwebapp.service.ListeningProgressService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class ListenController {

    private final LearnerContentService learnerContentService;
    private final DauToeicClientService dauToeicClientService;
    private final ListeningProgressService listeningProgressService;

    @GetMapping("/listen")
    public String listen(
            @RequestParam(defaultValue = "1") String part,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        String activeId = normalizePart(part);
        List<ListenPartView> parts = parts(activeId);
        ListenPartView activePart = activePart(parts);

        model.addAttribute("parts", parts);
        model.addAttribute("activePart", activePart);
        addInternalFallbackQuestions(activeId, model);
        addDauToeicLevels(activeId, user, model);
        return "listen/index";
    }

    @GetMapping("/listen/practice")
    public String practice(
            @RequestParam(defaultValue = "1") int part,
            @RequestParam(defaultValue = "1") int level,
            @RequestParam(defaultValue = "normal") String mode,
            @RequestParam(defaultValue = "30") int assist,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        String activeId = normalizePart(String.valueOf(part));
        List<ListenPartView> parts = parts(activeId);
        ListenPartView activePart = activePart(parts);

        model.addAttribute("parts", parts);
        model.addAttribute("activePart", activePart);
        model.addAttribute("selectedLevel", level);
        model.addAttribute("selectedMode", normalizeMode(mode));
        model.addAttribute("assistPercent", normalizeAssist(assist));
        model.addAttribute("assistOptions", List.of(10, 20, 30, 50, 70, 100));
        model.addAttribute("listeningUserAuthenticated", user != null);
        try {
            model.addAttribute("practiceSession", dauToeicClientService.getDifficultySession(
                    Integer.parseInt(activeId),
                    level,
                    20));
        } catch (RuntimeException exception) {
            model.addAttribute("dauToeicError", "Không tải được phiên luyện nghe từ Đậu TOEIC.");
        }
        return "listen/practice";
    }

    private void addInternalFallbackQuestions(String activeId, Model model) {
        Pageable pageable = PageRequest.of(0, 8);
        var questions = learnerContentService.findPublishedQuestions(
                questionParts(activeId),
                SkillType.LISTENING,
                pageable);
        model.addAttribute("questions", questions);
        model.addAttribute("optionsByQuestionId", learnerContentService.findOptionsByQuestionId(questions));
    }

    private void addDauToeicLevels(String activeId, AppUserPrincipal user, Model model) {
        if ("dictation".equals(activeId)) {
            return;
        }
        try {
            model.addAttribute("dauToeicLevels", listeningProgressService.applyProgress(
                    user == null ? null : user.id(),
                    dauToeicClientService.listDifficultyLevels(Integer.parseInt(activeId))));
        } catch (RuntimeException exception) {
            model.addAttribute("dauToeicError", "Không tải được dữ liệu level từ Đậu TOEIC.");
        }
    }

    private String normalizePart(String part) {
        return switch (part) {
            case "2", "3", "4", "dictation" -> part;
            default -> "1";
        };
    }

    private String normalizeMode(String mode) {
        return switch (mode) {
            case "bilingual", "fill", "flip" -> mode;
            default -> "normal";
        };
    }

    private int normalizeAssist(int assist) {
        return switch (assist) {
            case 10, 20, 30, 50, 70, 100 -> assist;
            default -> 30;
        };
    }

    private ListenPartView activePart(List<ListenPartView> parts) {
        return parts.stream()
                .filter(ListenPartView::active)
                .findFirst()
                .orElse(parts.get(0));
    }

    private List<ListenPartView> parts(String activeId) {
        return List.of(
                new ListenPartView("1", "Part 1: Hình ảnh", "Luyện Part 1 theo 5 cấp độ", "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo tỉ lệ sai thực tế.", "P1", "1".equals(activeId)),
                new ListenPartView("2", "Part 2: Hỏi - Đáp", "Luyện Part 2 theo 5 cấp độ", "Câu hỏi ngắn để luyện phản xạ nghe câu hỏi và chọn đáp án phù hợp.", "P2", "2".equals(activeId)),
                new ListenPartView("3", "Part 3: Hội thoại ngắn", "Luyện Part 3 theo 5 cấp độ", "Một đoạn hội thoại đi kèm nhóm câu hỏi, phù hợp để luyện nghe theo ngữ cảnh.", "P3", "3".equals(activeId)),
                new ListenPartView("4", "Part 4: Độc thoại", "Luyện Part 4 theo 5 cấp độ", "Một bài nói ngắn đi kèm nhóm câu hỏi, giúp tăng khả năng nắm ý chính và chi tiết.", "P4", "4".equals(activeId)),
                new ListenPartView("dictation", "Nghe chép (Dictation)", "Luyện nghe chép theo 5 cấp độ", "Rèn phản xạ nghe chi tiết bằng cách gõ lại nội dung bạn nghe được.", "D", "dictation".equals(activeId)));
    }

    private List<Integer> questionParts(String activeId) {
        return switch (activeId) {
            case "2" -> List.of(2);
            case "3" -> List.of(3);
            case "4" -> List.of(4);
            case "dictation" -> List.of(1, 2, 3, 4);
            default -> List.of(1);
        };
    }
}
