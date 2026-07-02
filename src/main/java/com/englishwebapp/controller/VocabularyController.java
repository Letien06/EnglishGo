package com.englishwebapp.controller;

import com.englishwebapp.dto.AiVocabCandidate;
import com.englishwebapp.dto.AiVocabSaveRequest;
import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.VocabReviewRequest;
import com.englishwebapp.dto.VocabReviewResponse;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.VocabService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequiredArgsConstructor
public class VocabularyController {

    private final VocabService vocabService;

    @GetMapping("/vocab")
    public String sets(
            @RequestParam(required = false) String topic,
            @RequestParam(defaultValue = "learn") String tab,
            @RequestParam(required = false) Long folderId,
            @RequestParam(required = false) Long communityFolderId,
            @RequestParam(required = false) String folderSearch,
            @RequestParam(required = false) String q,
            @PageableDefault(size = 12) Pageable pageable,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        Long userId = user == null ? null : user.id();
        String activeTab = normalizeTab(tab);
        model.addAttribute("sets", Page.empty(pageable));
        model.addAttribute("mySets", List.of());
        model.addAttribute("myFolders", List.of());
        model.addAttribute("communityFolders", List.of());
        model.addAttribute("selectedCommunityFolder", null);
        model.addAttribute("communitySets", List.of());
        model.addAttribute("practiceSets", List.of());
        model.addAttribute("progressSets", List.of());
        model.addAttribute("selectedFolderId", folderId);
        model.addAttribute("selectedCommunityFolderId", communityFolderId);
        model.addAttribute("folderSearch", folderSearch);
        model.addAttribute("communityQuery", q);
        model.addAttribute("topic", topic);
        model.addAttribute("tab", activeTab);
        model.addAttribute("totalWords", 0L);
        model.addAttribute("learnedWords", 0L);
        model.addAttribute("masteredWords", 0L);
        model.addAttribute("dueWords", 0L);
        model.addAttribute("studiedToday", 0L);
        model.addAttribute("dailyNewGoal", vocabService.dailyNewWordGoal());
        model.addAttribute("dailyNewPercent", 0);
        if ("progress".equals(activeTab)) {
            addProgressTabModel(userId, model);
        } else if ("my".equals(activeTab)) {
            model.addAttribute("mySets", vocabService.findMySetCards(userId, folderId));
            model.addAttribute("myFolders", vocabService.findMyFolderCards(userId, folderSearch));
            model.addAttribute("dueWords", vocabService.dueWords(userId));
        } else if ("community".equals(activeTab)) {
            model.addAttribute("communityFolders", vocabService.findCommunityFolderCards(q));
            if (communityFolderId != null) {
                model.addAttribute("selectedCommunityFolder", vocabService.getCommunityFolderCard(communityFolderId));
                model.addAttribute("communitySets", vocabService.findCommunitySetCards(communityFolderId));
                model.addAttribute("mySets", vocabService.findMySetCards(userId));
            }
        }
        model.addAttribute("fallbackSets", List.of("Contracts", "Marketing", "Warranties", "Business Planning"));
        return "vocab/sets";
    }

    @GetMapping("/vocabulary")
    public String vocabulary(
            @RequestParam(required = false) String topic,
            @RequestParam(defaultValue = "learn") String tab,
            @RequestParam(required = false) Long folderId,
            @RequestParam(required = false) Long communityFolderId,
            @RequestParam(required = false) String folderSearch,
            @RequestParam(required = false) String q,
            @PageableDefault(size = 12) Pageable pageable,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        return sets(topic, tab, folderId, communityFolderId, folderSearch, q, pageable, user, model);
    }

    @GetMapping("/vocab/sets/{setId}/flashcards")
    public String flashcards(
            @PathVariable Long setId,
            @RequestParam(defaultValue = "menu") String mode,
            @RequestParam(defaultValue = "learning") String mastery,
            @RequestParam(defaultValue = "random") String order,
            @RequestParam(defaultValue = "20") String amount,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        Long userId = user == null ? null : user.id();
        model.addAttribute("vocabSession", vocabService.getFilteredSession(setId, userId, mastery, order, amount));
        model.addAttribute("mode", normalizeMode(mode));
        model.addAttribute("reviewMode", false);
        model.addAttribute("practiceSets", vocabService.findPracticeSetOptions(userId));
        model.addAttribute("selectedMastery", normalizeMastery(mastery));
        model.addAttribute("selectedOrder", normalizeOrder(order));
        model.addAttribute("selectedAmount", normalizeAmount(amount));
        return "vocab/flashcards";
    }

    @GetMapping("/vocab/sets/{setId}")
    public String setDetail(
            @PathVariable Long setId,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        Long userId = user == null ? null : user.id();
        model.addAttribute("detail", vocabService.getSetDetail(setId, userId));
        return "vocab/set-detail";
    }

    @PostMapping("/vocab/sets/{setId}/ai-words")
    public String generateAiWords(
            @PathVariable Long setId,
            @RequestParam(defaultValue = "topic") String mode,
            @RequestParam(required = false) String input,
            @RequestParam(defaultValue = "10") Integer count,
            @RequestParam(required = false) MultipartFile image,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        try {
            int created = vocabService.generateWordsWithAi(
                    setId,
                    user == null ? null : user.id(),
                    mode,
                    input,
                    count,
                    image);
            redirectAttributes.addFlashAttribute("notice", "Đã thêm " + created + " từ bằng Gemini.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab/sets/" + setId;
    }

    @PostMapping("/api/vocab/sets/{setId}/ai-words/preview")
    @ResponseBody
    public ResponseEntity<ApiResponse<List<AiVocabCandidate>>> previewAiWords(
            @PathVariable Long setId,
            @RequestParam(defaultValue = "topic") String mode,
            @RequestParam(required = false) String input,
            @RequestParam(defaultValue = "10") Integer count,
            @RequestParam(required = false) MultipartFile image) {
        return ResponseEntity.ok(ApiResponse.ok(vocabService.previewAiWords(setId, mode, input, count, image)));
    }

    @PostMapping("/api/vocab/sets/{setId}/ai-words/save")
    @ResponseBody
    public ResponseEntity<ApiResponse<Integer>> saveAiWords(
            @PathVariable Long setId,
            @RequestBody AiVocabSaveRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(vocabService.saveAiWords(setId, request.words())));
    }

    @GetMapping("/vocab/review")
    public String reviewSession(
            @RequestParam(defaultValue = "flashcard") String mode,
            @AuthenticationPrincipal AppUserPrincipal user,
            Model model) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab/review";
        }
        model.addAttribute("vocabSession", vocabService.getReviewSession(user.id(), 50));
        model.addAttribute("mode", normalizeMode(mode));
        model.addAttribute("reviewMode", true);
        model.addAttribute("practiceSets", vocabService.findPracticeSetOptions(user.id()));
        model.addAttribute("selectedMastery", "due");
        model.addAttribute("selectedOrder", "random");
        model.addAttribute("selectedAmount", "50");
        return "vocab/flashcards";
    }

    @PostMapping("/api/vocab/words/{wordId}/review")
    @ResponseBody
    public ResponseEntity<ApiResponse<VocabReviewResponse>> review(
            @PathVariable Long wordId,
            @AuthenticationPrincipal AppUserPrincipal user,
                @Valid @RequestBody VocabReviewRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(vocabService.review(user == null ? null : user.id(), wordId, request.quality())));
    }

    @PostMapping("/vocab/my-sets")
    public String createMySet(
            @RequestParam String title,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String icon,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.createMySet(user.id(), title, description, icon);
            redirectAttributes.addFlashAttribute("notice", "Đã tạo bộ từ vựng.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-sets/words/manual")
    public String addManualWords(
            @RequestParam Long targetSetId,
            @RequestParam String rowsText,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            int created = vocabService.addManualWords(user.id(), targetSetId, rowsText);
            redirectAttributes.addFlashAttribute("notice", "Đã thêm " + created + " từ thủ công.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab/sets/" + targetSetId;
    }

    @PostMapping("/vocab/my-sets/words/import")
    public String importWords(
            @RequestParam Long targetSetId,
            @RequestParam MultipartFile file,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            int created = vocabService.importWords(user.id(), targetSetId, file);
            redirectAttributes.addFlashAttribute("notice", "Đã nhập " + created + " từ từ file.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab/sets/" + targetSetId;
    }

    @PostMapping("/vocab/my-folders")
    public String createMyFolder(
            @RequestParam String name,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.createMyFolder(user.id(), name);
            redirectAttributes.addFlashAttribute("notice", "Đã tạo folder.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-sets/{setId}/folder")
    public String assignMySetFolder(
            @PathVariable Long setId,
            @RequestParam(required = false) Long folderId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.assignMySetToFolder(user.id(), setId, folderId);
            redirectAttributes.addFlashAttribute("notice", folderId == null ? "Đã bỏ bộ từ khỏi folder." : "Đã thêm bộ từ vào folder.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-folders/{folderId}/share")
    public String shareMyFolder(
            @PathVariable Long folderId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.shareMyFolder(user.id(), folderId);
            redirectAttributes.addFlashAttribute("notice", "Đã chia sẻ folder lên cộng đồng.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-folders/{folderId}/rename")
    public String renameMyFolder(
            @PathVariable Long folderId,
            @RequestParam String name,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.renameMyFolder(user.id(), folderId, name);
            redirectAttributes.addFlashAttribute("notice", "Đã đổi tên folder.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-folders/{folderId}/delete")
    public String deleteMyFolder(
            @PathVariable Long folderId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.deleteMyFolder(user.id(), folderId);
            redirectAttributes.addFlashAttribute("notice", "Đã xóa folder.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/community/folders/{folderId}/copy")
    public String copyCommunityFolder(
            @PathVariable Long folderId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dcommunity";
        }
        try {
            vocabService.copyCommunityFolder(user.id(), folderId);
            redirectAttributes.addFlashAttribute("notice", "Đã sao chép folder vào bộ từ của bạn.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/community/sets/{setId}/copy")
    public String copyCommunitySet(
            @PathVariable Long setId,
            @RequestParam(required = false) Long targetSetId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dcommunity";
        }
        try {
            int copied = vocabService.copyCommunitySet(user.id(), setId, targetSetId);
            redirectAttributes.addFlashAttribute("notice", "Đã sao chép " + copied + " từ.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-sets/{setId}/rename")
    public String renameMySet(
            @PathVariable Long setId,
            @RequestParam String title,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.renameMySet(user.id(), setId, title);
            redirectAttributes.addFlashAttribute("notice", "Đã đổi tên bộ từ.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    @PostMapping("/vocab/my-sets/{setId}/delete")
    public String deleteMySet(
            @PathVariable Long setId,
            @AuthenticationPrincipal AppUserPrincipal user,
            RedirectAttributes redirectAttributes) {
        if (user == null) {
            return "redirect:/login?redirect=/vocab%3Ftab%3Dmy";
        }
        try {
            vocabService.deleteMySet(user.id(), setId);
            redirectAttributes.addFlashAttribute("notice", "Đã xóa bộ từ.");
        } catch (RuntimeException exception) {
            redirectAttributes.addFlashAttribute("error", errorMessage(exception));
        }
        return "redirect:/vocab?tab=my";
    }

    private String normalizeTab(String tab) {
        return switch (tab == null ? "" : tab) {
            case "progress", "my", "community", "algorithm" -> tab;
            default -> "learn";
        };
    }

    private void addProgressTabModel(Long userId, Model model) {
        if (userId == null) {
            return;
        }
        model.addAttribute("totalWords", vocabService.totalWords(userId));
        model.addAttribute("learnedWords", vocabService.learnedWords(userId));
        model.addAttribute("masteredWords", vocabService.masteredWords(userId));
        model.addAttribute("dueWords", vocabService.dueWords(userId));
        long studiedToday = vocabService.studiedWordsToday(userId);
        int dailyNewGoal = vocabService.dailyNewWordGoal();
        model.addAttribute("studiedToday", studiedToday);
        model.addAttribute("dailyNewGoal", dailyNewGoal);
        model.addAttribute("dailyNewPercent", dailyNewGoal == 0 ? 0 : Math.min(100, Math.round((studiedToday * 100.0f) / dailyNewGoal)));
        model.addAttribute("progressSets", vocabService.findProgressSetCards(userId));
    }

    private String normalizeMode(String mode) {
        return switch (mode == null ? "" : mode) {
            case "menu", "quiz", "listening", "typing", "matching", "mixed" -> mode;
            default -> "flashcard";
        };
    }

    private String normalizeMastery(String mastery) {
        return switch (mastery == null ? "" : mastery) {
            case "all", "mastered", "due" -> mastery;
            default -> "learning";
        };
    }

    private String normalizeOrder(String order) {
        return "ordered".equals(order) ? "ordered" : "random";
    }

    private String normalizeAmount(String amount) {
        return "all".equals(amount) || "50".equals(amount) ? amount : "20";
    }

    private String errorMessage(RuntimeException exception) {
        if (exception instanceof ResponseStatusException statusException
                && statusException.getReason() != null
                && !statusException.getReason().isBlank()) {
            return statusException.getReason();
        }
        return "Không thể tạo từ với AI. Vui lòng thử lại sau.";
    }
}
