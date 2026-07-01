package com.englishwebapp.controller;

import com.englishwebapp.dto.ListenPartView;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.service.LearnerContentService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class ListenController {

    private final LearnerContentService learnerContentService;

    @GetMapping("/listen")
    public String listen(@RequestParam(defaultValue = "1") String part, Model model) {
        String activeId = normalizePart(part);
        List<ListenPartView> parts = parts(activeId);
        ListenPartView activePart = parts.stream()
                .filter(ListenPartView::active)
                .findFirst()
                .orElse(parts.get(0));

        model.addAttribute("parts", parts);
        model.addAttribute("activePart", activePart);
        Pageable pageable = PageRequest.of(0, 8);
        var questions = learnerContentService.findPublishedQuestions(
                questionParts(activeId),
                SkillType.LISTENING,
                pageable);
        model.addAttribute("questions", questions);
        model.addAttribute("optionsByQuestionId", learnerContentService.findOptionsByQuestionId(questions));
        return "listen/index";
    }

    private String normalizePart(String part) {
        return switch (part) {
            case "2", "3", "4", "dictation" -> part;
            default -> "1";
        };
    }

    private List<ListenPartView> parts(String activeId) {
        return List.of(
                new ListenPartView("1", "Part 1: Hình ảnh", "Luyện Part 1 theo 5 cấp độ", "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo độ khó.", "▧", "1".equals(activeId)),
                new ListenPartView("2", "Part 2: Hỏi - Đáp", "Luyện Part 2 theo 5 cấp độ", "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo độ khó.", "▱", "2".equals(activeId)),
                new ListenPartView("3", "Part 3: Hội thoại ngắn", "Luyện Part 3 theo 5 cấp độ", "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo độ khó.", "♙", "3".equals(activeId)),
                new ListenPartView("4", "Part 4: Độc thoại", "Luyện Part 4 theo 5 cấp độ", "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo độ khó.", "♩", "4".equals(activeId)),
                new ListenPartView("dictation", "Nghe chép (Dictation)", "Luyện nghe chép theo 5 cấp độ", "Rèn phản xạ nghe chi tiết bằng cách gõ lại nội dung bạn nghe được.", "╱", "dictation".equals(activeId)));
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
