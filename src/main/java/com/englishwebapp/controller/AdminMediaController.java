package com.englishwebapp.controller;

import com.englishwebapp.dto.MediaUploadResponse;
import com.englishwebapp.entity.MediaType;
import com.englishwebapp.repository.MediaAssetRepository;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequiredArgsConstructor
public class AdminMediaController {

    private final MediaStorageService mediaStorageService;
    private final MediaAssetRepository mediaAssetRepository;

    @GetMapping("/admin/media")
    public String media(
            @RequestParam(required = false) MediaType mediaType,
            @RequestParam(defaultValue = "0") int page,
            Model model) {
        PageRequest pageable = PageRequest.of(Math.max(page, 0), 24);
        var assets = mediaType == null
                ? mediaAssetRepository.findAll(pageable)
                : mediaAssetRepository.findByMediaType(mediaType, pageable);
        model.addAttribute("assets", assets);
        model.addAttribute("mediaTypes", MediaType.values());
        model.addAttribute("selectedMediaType", mediaType);
        return "admin/media";
    }

    @PostMapping("/admin/media/upload")
    public String uploadFromPage(
            @RequestParam MediaType mediaType,
            @RequestParam MultipartFile file,
            @AuthenticationPrincipal AppUserPrincipal principal,
            RedirectAttributes redirectAttributes) {
        try {
            mediaStorageService.store(file, mediaType, principal);
            redirectAttributes.addFlashAttribute("adminNotice", "Upload file thành công.");
        } catch (RuntimeException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/media";
    }

    @PostMapping("/admin/api/media/upload")
    @ResponseBody
    public MediaUploadResponse upload(
            @RequestParam MediaType mediaType,
            @RequestParam MultipartFile file,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        return mediaStorageService.store(file, mediaType, principal);
    }
}
