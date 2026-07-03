package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.ReadingProgressRequest;
import com.englishwebapp.dto.ReadingProgressResponse;
import com.englishwebapp.dto.ReadingToolRequest;
import com.englishwebapp.dto.ReadingToolResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.ReadingProgressService;
import com.englishwebapp.service.ReadingToolService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reading")
@RequiredArgsConstructor
public class ReadingProgressController {

    private final ReadingProgressService readingProgressService;
    private final ReadingToolService readingToolService;

    @PostMapping("/progress")
    public ResponseEntity<ApiResponse<ReadingProgressResponse>> progress(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ReadingProgressRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(readingProgressService.record(
                user == null ? null : user.firebaseUid(),
                request)));
    }

    @PostMapping("/notes")
    public ResponseEntity<ApiResponse<ReadingToolResponse>> notes(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ReadingToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(readingToolService.saveNote(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/favorites")
    public ResponseEntity<ApiResponse<ReadingToolResponse>> favorites(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ReadingToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(readingToolService.toggleFavorite(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/vocab-basket")
    public ResponseEntity<ApiResponse<ReadingToolResponse>> vocabBasket(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ReadingToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(readingToolService.addVocab(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<ReadingToolResponse>> reset(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ReadingToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(readingToolService.resetLevel(user == null ? null : user.firebaseUid(), request)));
    }
}
