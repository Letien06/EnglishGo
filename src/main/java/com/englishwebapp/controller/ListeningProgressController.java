package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.ListeningProgressRequest;
import com.englishwebapp.dto.ListeningProgressResponse;
import com.englishwebapp.dto.ListeningToolRequest;
import com.englishwebapp.dto.ListeningToolResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.ListeningProgressService;
import com.englishwebapp.service.ListeningToolService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/listening")
@RequiredArgsConstructor
public class ListeningProgressController {

    private final ListeningProgressService listeningProgressService;
    private final ListeningToolService listeningToolService;

    @PostMapping("/progress")
    public ResponseEntity<ApiResponse<ListeningProgressResponse>> progress(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ListeningProgressRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(listeningProgressService.record(
                user == null ? null : user.firebaseUid(),
                request)));
    }

    @PostMapping("/notes")
    public ResponseEntity<ApiResponse<ListeningToolResponse>> notes(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ListeningToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(listeningToolService.saveNote(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/favorites")
    public ResponseEntity<ApiResponse<ListeningToolResponse>> favorites(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ListeningToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(listeningToolService.toggleFavorite(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/vocab-basket")
    public ResponseEntity<ApiResponse<ListeningToolResponse>> vocabBasket(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ListeningToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(listeningToolService.addVocab(user == null ? null : user.firebaseUid(), request)));
    }

    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<ListeningToolResponse>> reset(
            @AuthenticationPrincipal AppUserPrincipal user,
            @RequestBody ListeningToolRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(listeningToolService.resetLevel(user == null ? null : user.firebaseUid(), request)));
    }
}
