package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.DauToeicDifficultySessionResponse;
import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicSetResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.ListeningProgressService;
import com.englishwebapp.service.ReadingProgressService;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dautoeic")
@RequiredArgsConstructor
public class DauToeicController {

    /** HTTP cache: allow the browser to reuse JSON responses for 5 minutes. */
    private static final CacheControl CACHE_5_MIN = CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic();

    private final DauToeicClientService dauToeicClientService;
    private final ListeningProgressService listeningProgressService;
    private final ReadingProgressService readingProgressService;

    @GetMapping("/sets")
    public ResponseEntity<ApiResponse<List<DauToeicSetResponse>>> sets() {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.listSets()));
    }

    @GetMapping("/tests")
    public ResponseEntity<ApiResponse<List<DauToeicTestResponse>>> tests(
            @RequestParam(required = false) String setId) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.listTests(setId)));
    }

    @GetMapping("/tests/{testId}")
    public ResponseEntity<ApiResponse<DauToeicTestResponse>> test(@PathVariable String testId) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getTest(testId)));
    }

    @GetMapping("/tests/{testId}/parts/{part}")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> part(
            @PathVariable String testId,
            @PathVariable int part) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getPart(testId, part)));
    }

    @GetMapping("/tests/{testId}/listening")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> listening(
            @PathVariable String testId,
            @RequestParam(defaultValue = "1") int part) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getListeningPart(testId, part)));
    }

    @GetMapping("/tests/{testId}/reading")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> reading(
            @PathVariable String testId,
            @RequestParam(defaultValue = "5") int part) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getReadingPart(testId, part)));
    }

    @GetMapping("/difficulty/parts/{part}/levels")
    public ResponseEntity<ApiResponse<List<DauToeicDifficultyLevelResponse>>> difficultyLevels(
            @PathVariable int part,
            @AuthenticationPrincipal AppUserPrincipal user) {
        List<DauToeicDifficultyLevelResponse> levels = listeningProgressService.applyProgress(
                user == null ? null : user.firebaseUid(),
                dauToeicClientService.listDifficultyLevels(part));
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(levels));
    }

    @GetMapping("/difficulty/parts/{part}/levels/{level}")
    public ResponseEntity<ApiResponse<DauToeicDifficultySessionResponse>> difficultySession(
            @PathVariable int part,
            @PathVariable int level,
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getDifficultySession(part, level, limit)));
    }

    @GetMapping("/reading/parts/{part}/levels")
    public ResponseEntity<ApiResponse<List<DauToeicDifficultyLevelResponse>>> readingDifficultyLevels(
            @PathVariable int part,
            @AuthenticationPrincipal AppUserPrincipal user) {
        List<DauToeicDifficultyLevelResponse> levels = readingProgressService.applyProgress(
                user == null ? null : user.firebaseUid(),
                dauToeicClientService.listReadingDifficultyLevels(part));
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(levels));
    }

    @GetMapping("/reading/parts/{part}/levels/{level}")
    public ResponseEntity<ApiResponse<DauToeicDifficultySessionResponse>> readingDifficultySession(
            @PathVariable int part,
            @PathVariable int level,
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok()
                .cacheControl(CACHE_5_MIN)
                .body(ApiResponse.ok(dauToeicClientService.getReadingDifficultySession(part, level, limit)));
    }
}
