package com.englishwebapp.controller;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class LessonController {

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

    @GetMapping("/lessons/{lessonId}")
    public String lesson(@PathVariable Long lessonId) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson content is disabled");
    }

    private void populateLessons(String topic, Pageable pageable, Model model) {
        model.addAttribute("lessons", Page.empty(pageable));
        model.addAttribute("topic", topic);
    }
}
