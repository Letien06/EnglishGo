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
public class ReadController {

    private final LearnerContentService learnerContentService;

    @GetMapping("/read")
    public String read(@RequestParam(defaultValue = "grammar") String part, Model model) {
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
                SkillType.READING,
                pageable);
        model.addAttribute("questions", questions);
        model.addAttribute("optionsByQuestionId", learnerContentService.findOptionsByQuestionId(questions));
        model.addAttribute("lessons", learnerContentService.findPublishedLessons(PageRequest.of(0, 6)));
        return "read/index";
    }

    private String normalizePart(String part) {
        return switch (part) {
            case "part5", "part6", "part7", "bilingual" -> part;
            default -> "grammar";
        };
    }

    private List<ListenPartView> parts(String activeId) {
        return List.of(
                new ListenPartView("grammar", "Ngữ pháp", "Ngữ pháp TOEIC", "Học theo chủ điểm và luyện theo bộ đề ETS/YBM.", "▥", "grammar".equals(activeId)),
                new ListenPartView("part5", "Part 5: Hoàn thành câu", "Part 5: Hoàn thành câu", "Luyện câu hỏi ngữ pháp và từ vựng trong từng câu đơn TOEIC.", "▤", "part5".equals(activeId)),
                new ListenPartView("part6", "Part 6: Hoàn thành đoạn văn", "Part 6: Hoàn thành đoạn văn", "Luyện điền câu, từ và cụm từ theo ngữ cảnh đoạn văn.", "≡", "part6".equals(activeId)),
                new ListenPartView("part7", "Part 7: Đọc hiểu", "Part 7: Đọc hiểu", "Luyện đọc email, thông báo, quảng cáo và bộ nhiều đoạn văn.", "▥", "part7".equals(activeId)),
                new ListenPartView("bilingual", "Đọc song ngữ", "Đọc song ngữ", "Đọc Anh - Việt theo chủ đề để tăng tốc hiểu ý chính và từ vựng.", "文", "bilingual".equals(activeId)));
    }

    private List<Integer> questionParts(String activeId) {
        return switch (activeId) {
            case "part6" -> List.of(6);
            case "part7", "bilingual" -> List.of(7);
            default -> List.of(5);
        };
    }
}
