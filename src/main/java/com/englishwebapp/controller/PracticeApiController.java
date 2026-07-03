package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.DraftAnswerRequest;
import com.englishwebapp.dto.DraftAnswerResponse;
import com.englishwebapp.dto.PracticeSubmissionRequest;
import com.englishwebapp.dto.PracticeSubmissionResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.PracticeSubmissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/practice")
@RequiredArgsConstructor
public class PracticeApiController {

    private final PracticeSubmissionService practiceSubmissionService;

    @PostMapping("/tests/{testId}/draft")
    public ResponseEntity<ApiResponse<DraftAnswerResponse>> saveDraft(
            @PathVariable Long testId,
            @AuthenticationPrincipal AppUserPrincipal user,
            @Valid @RequestBody DraftAnswerRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                practiceSubmissionService.saveDraft(uid(user), testId, request.payload())));
    }

    @PostMapping("/tests/{testId}/submit")
    public ResponseEntity<ApiResponse<PracticeSubmissionResponse>> submit(
            @PathVariable Long testId,
            @AuthenticationPrincipal AppUserPrincipal user,
            @Valid @RequestBody PracticeSubmissionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                practiceSubmissionService.submit(uid(user), testId, request)));
    }

    private String uid(AppUserPrincipal user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.firebaseUid();
    }
}
