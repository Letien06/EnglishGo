package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.VocabReviewRequest;
import com.englishwebapp.dto.VocabReviewResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.VocabService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@RequiredArgsConstructor
public class VocabularyController {

    private final VocabService vocabService;

    @GetMapping("/vocab")
    public String sets(
            @RequestParam(required = false) String topic,
            @PageableDefault(size = 12) Pageable pageable,
            Model model) {
        model.addAttribute("sets", vocabService.findSets(topic, pageable));
        model.addAttribute("topic", topic);
        return "vocab/sets";
    }

    @GetMapping("/vocab/sets/{setId}/flashcards")
    public String flashcards(@PathVariable Long setId, Model model) {
        model.addAttribute("session", vocabService.getSession(setId));
        return "vocab/flashcards";
    }

    @PostMapping("/api/vocab/words/{wordId}/review")
    @ResponseBody
    public ResponseEntity<ApiResponse<VocabReviewResponse>> review(
            @PathVariable Long wordId,
            @AuthenticationPrincipal AppUserPrincipal user,
            @Valid @RequestBody VocabReviewRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(vocabService.review(user.id(), wordId, request.quality())));
    }
}
