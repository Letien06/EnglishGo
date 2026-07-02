package com.englishwebapp.controller;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.repository.LessonRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequiredArgsConstructor
public class LessonController {

    private final LessonRepository lessonRepository;

    @GetMapping("/lessons")
    public String lessons(
            @RequestParam(required = false) String topic,
            @PageableDefault(size = 12) Pageable pageable,
            Model model) {
        populateLessons(topic, pageable, model);
        model.addAttribute("grammarMode", false);
        return "lessons/list";
    }

    @GetMapping("/grammar")
    public String grammar(
            @RequestParam(defaultValue = "grammar") String topic,
            @PageableDefault(size = 12) Pageable pageable,
            Model model) {
        populateLessons(topic, pageable, model);
        model.addAttribute("grammarMode", true);
        return "lessons/list";
    }

    private void populateLessons(String topic, Pageable pageable, Model model) {
        model.addAttribute("lessons", StringUtils.hasText(topic)
                ? lessonRepository.findByTopicContainingIgnoreCaseAndStatus(topic, ContentStatus.PUBLISHED, pageable)
                : lessonRepository.findByStatus(ContentStatus.PUBLISHED, pageable));
        model.addAttribute("topic", topic);
    }

    @GetMapping("/lessons/{lessonId}")
    public String lesson(@PathVariable Long lessonId, Model model) {
        model.addAttribute("lesson", lessonRepository.findByIdAndStatus(lessonId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found")));
        return "lessons/detail";
    }
}
