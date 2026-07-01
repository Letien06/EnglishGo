package com.englishwebapp.controller;

import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicSetResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.englishwebapp.service.DauToeicClientService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dautoeic")
@RequiredArgsConstructor
public class DauToeicController {

    private final DauToeicClientService dauToeicClientService;

    @GetMapping("/sets")
    public ResponseEntity<ApiResponse<List<DauToeicSetResponse>>> sets() {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.listSets()));
    }

    @GetMapping("/tests")
    public ResponseEntity<ApiResponse<List<DauToeicTestResponse>>> tests(
            @RequestParam(required = false) String setId) {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.listTests(setId)));
    }

    @GetMapping("/tests/{testId}")
    public ResponseEntity<ApiResponse<DauToeicTestResponse>> test(@PathVariable String testId) {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.getTest(testId)));
    }

    @GetMapping("/tests/{testId}/parts/{part}")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> part(
            @PathVariable String testId,
            @PathVariable int part) {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.getPart(testId, part)));
    }

    @GetMapping("/tests/{testId}/listening")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> listening(
            @PathVariable String testId,
            @RequestParam(defaultValue = "1") int part) {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.getListeningPart(testId, part)));
    }

    @GetMapping("/tests/{testId}/reading")
    public ResponseEntity<ApiResponse<DauToeicPartResponse>> reading(
            @PathVariable String testId,
            @RequestParam(defaultValue = "5") int part) {
        return ResponseEntity.ok(ApiResponse.ok(dauToeicClientService.getReadingPart(testId, part)));
    }
}
