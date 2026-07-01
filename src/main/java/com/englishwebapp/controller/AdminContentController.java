package com.englishwebapp.controller;

import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Lesson;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.englishwebapp.service.AdminContentGenerationService;
import com.englishwebapp.service.AdminContentImportService;
import com.englishwebapp.dto.AdminContentImportResult;
import com.englishwebapp.entity.ContentAuditLog;
import com.englishwebapp.repository.AcceptedAnswerRepository;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.ContentAuditLogRepository;
import com.englishwebapp.repository.LessonRepository;
import com.englishwebapp.repository.MediaAssetRepository;
import com.englishwebapp.repository.QuestionGroupRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabSetRepository;
import com.englishwebapp.repository.VocabWordRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequiredArgsConstructor
public class AdminContentController {

    private static final PageRequest RECENT = PageRequest.of(0, 50, Sort.by(Sort.Direction.DESC, "id"));

    private final TestRepository testRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final AcceptedAnswerRepository acceptedAnswerRepository;
    private final VocabSetRepository vocabSetRepository;
    private final VocabWordRepository vocabWordRepository;
    private final LessonRepository lessonRepository;
    private final UserRepository userRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final MediaAssetRepository mediaAssetRepository;
    private final ContentAuditLogRepository contentAuditLogRepository;
    private final AdminContentGenerationService contentGenerationService;
    private final AdminContentImportService contentImportService;

    @GetMapping("/admin")
    public String dashboard(Model model) {
        model.addAttribute("totalQuestions", questionRepository.count());
        model.addAttribute("publishedQuestions", questionRepository.countByStatus(ContentStatus.PUBLISHED));
        model.addAttribute("draftQuestions", questionRepository.countByStatus(ContentStatus.DRAFT));
        model.addAttribute("totalGroups", questionGroupRepository.count());
        model.addAttribute("publishedGroups", questionGroupRepository.countByStatus(ContentStatus.PUBLISHED));
        model.addAttribute("totalMedia", mediaAssetRepository.count());
        model.addAttribute("totalUsers", userRepository.count());
        model.addAttribute("adminUsers", userRepository.countByRole(UserRole.ADMIN));
        return "admin/index";
    }

    @GetMapping("/admin/users")
    public String users(Model model) {
        model.addAttribute("users", userRepository.findAll(RECENT).getContent());
        model.addAttribute("roles", UserRole.values());
        return "admin/users";
    }

    @PostMapping("/admin/users/{id}/role")
    public String updateUserRole(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam UserRole role,
            RedirectAttributes redirectAttributes) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        if (principal != null && principal.id().equals(id) && role != UserRole.ADMIN) {
            redirectAttributes.addFlashAttribute("adminNotice", "Không thể tự gỡ quyền ADMIN của chính bạn.");
            return "redirect:/admin/users";
        }
        UserRole fromRole = user.getRole();
        user.setRole(role);
        userRepository.save(user);
        writeAudit(principal, "USER", id, "ROLE_UPDATE", null, null, fromRole + " -> " + role);
        redirectAttributes.addFlashAttribute("adminNotice", "Đã cập nhật quyền cho " + user.getEmail() + ".");
        return "redirect:/admin/users";
    }

    @GetMapping({"/admin/listening", "/admin/reading", "/admin/mock-test", "/admin/vocabulary"})
    public String module(Model model) {
        addAdminLists(model);
        return "admin/content";
    }

    @GetMapping({"/admin/import", "/admin/generate", "/admin/content-review"})
    public String workflowPlaceholder(Model model) {
        addAdminLists(model);
        model.addAttribute("pendingContent", pendingContentCount());
        model.addAttribute("pendingTests", testRepository.findByStatus(ContentStatus.PENDING_REVIEW, RECENT).getContent());
        model.addAttribute("reviewItems", questionRepository.findByStatus(ContentStatus.PENDING_REVIEW, RECENT).getContent());
        model.addAttribute("pendingLessons", lessonRepository.findByStatus(ContentStatus.PENDING_REVIEW, RECENT).getContent());
        model.addAttribute("pendingVocabSets", vocabSetRepository.findByStatus(ContentStatus.PENDING_REVIEW, RECENT).getContent());
        model.addAttribute("pendingVocabWords", vocabWordRepository.findByStatus(ContentStatus.PENDING_REVIEW, RECENT).getContent());
        return "admin/workflow";
    }

    @GetMapping("/admin/tests/{id}/edit")
    public String editTest(@PathVariable Long id, Model model) {
        addAdminLists(model);
        model.addAttribute("editType", "test");
        model.addAttribute("test", testRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found")));
        return "admin/edit";
    }

    @GetMapping("/admin/questions/{id}/edit")
    public String editQuestion(@PathVariable Long id, Model model) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
        addAdminLists(model);
        model.addAttribute("editType", "question");
        model.addAttribute("question", question);
        model.addAttribute("questionOptions", answerOptionRepository.findByQuestionIdOrderByIdAsc(id));
        model.addAttribute("acceptedAnswers", acceptedAnswerRepository.findByQuestionIdOrderByIdAsc(id));
        model.addAttribute("optionA", optionContent(id, 0));
        model.addAttribute("optionB", optionContent(id, 1));
        model.addAttribute("optionC", optionContent(id, 2));
        model.addAttribute("optionD", optionContent(id, 3));
        model.addAttribute("correctOption", correctOption(id));
        model.addAttribute("acceptedAnswer", acceptedAnswerContent(id));
        return "admin/edit";
    }

    @GetMapping("/admin/lessons/{id}/edit")
    public String editLesson(@PathVariable Long id, Model model) {
        addAdminLists(model);
        model.addAttribute("editType", "lesson");
        model.addAttribute("lesson", lessonRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found")));
        return "admin/edit";
    }

    @GetMapping("/admin/vocab-sets/{id}/edit")
    public String editVocabSet(@PathVariable Long id, Model model) {
        addAdminLists(model);
        model.addAttribute("editType", "vocabSet");
        model.addAttribute("vocabSet", vocabSetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found")));
        return "admin/edit";
    }

    @GetMapping("/admin/vocab-words/{id}/edit")
    public String editVocabWord(@PathVariable Long id, Model model) {
        addAdminLists(model);
        model.addAttribute("editType", "vocabWord");
        model.addAttribute("vocabWord", vocabWordRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found")));
        return "admin/edit";
    }

    @PostMapping("/admin/generate/questions")
    public String generateQuestions(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "reading") String module,
            @RequestParam(required = false) Long testId,
            @RequestParam(defaultValue = "5") Integer part,
            @RequestParam(required = false) String topic,
            @RequestParam(defaultValue = "5") Integer count,
            @RequestParam(required = false) String licenseNote,
            RedirectAttributes redirectAttributes) {
        AdminContentImportResult result = contentGenerationService.generateQuestions(
                principal, module, testId, part, topic, count, licenseNote);
        redirectAttributes.addFlashAttribute("adminNotice",
                "Đã tạo " + result.questions() + " câu hỏi AI-style vào hàng chờ duyệt.");
        return "redirect:/admin/content-review";
    }

    @PostMapping("/admin/import/file")
    public String importFile(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "reading") String module,
            @RequestParam(required = false) Long testId,
            @RequestParam(required = false) Long vocabSetId,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String licenseNote,
            @RequestParam MultipartFile file,
            RedirectAttributes redirectAttributes) {
        AdminContentImportResult result = contentImportService.importFile(
                principal, module, testId, vocabSetId, topic, licenseNote, file);
        redirectAttributes.addFlashAttribute("adminNotice",
                "Import xong: " + result.tests() + " đề, " + result.questions() + " câu hỏi, "
                        + result.lessons() + " bài đọc, " + result.vocabSets() + " bộ từ, "
                        + result.vocabWords() + " từ.");
        return "redirect:/admin/content-review";
    }

    @PostMapping("/admin/tests")
    public String createTest(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam(defaultValue = "TOEIC") String type,
            @RequestParam(defaultValue = "120") Integer duration,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote) {
        Test test = new Test();
        test.setTitle(title);
        test.setType(type);
        test.setDuration(duration);
        test.setDifficulty(difficulty);
        test.setCreatedBy(currentUser(principal));
        applyWorkflow(test, status, sourceType, sourceNote, licenseNote, principal);
        testRepository.save(test);
        return "redirect:/admin/mock-test";
    }

    @PostMapping("/admin/tests/{id}")
    public String updateTest(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam(defaultValue = "TOEIC") String type,
            @RequestParam(defaultValue = "120") Integer duration,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote) {
        Test test = testRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        test.setTitle(title);
        test.setType(type);
        test.setDuration(duration);
        test.setDifficulty(difficulty);
        applyWorkflow(test, status, sourceType, sourceNote, licenseNote, principal);
        testRepository.save(test);
        writeAudit(principal, "TEST", id, "UPDATE", null, status, null);
        return "redirect:/admin/mock-test";
    }

    @PostMapping("/admin/tests/{id}/publish")
    public String publishTest(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        Test test = testRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        ContentStatus fromStatus = test.getStatus();
        test.setStatus(ContentStatus.PUBLISHED);
        test.setReviewedBy(currentUser(principal));
        test.setReviewedAt(Instant.now());
        test.setPublishedAt(Instant.now());
        testRepository.save(test);
        writeAudit(principal, "TEST", id, "PUBLISH", fromStatus, ContentStatus.PUBLISHED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/tests/{id}/archive")
    public String archiveTest(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        Test test = testRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        ContentStatus fromStatus = test.getStatus();
        test.setStatus(ContentStatus.ARCHIVED);
        testRepository.save(test);
        writeAudit(principal, "TEST", id, "ARCHIVE", fromStatus, ContentStatus.ARCHIVED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/tests/{id}/delete")
    public String deleteTest(@PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal principal) {
        writeAudit(principal, "TEST", id, "DELETE", null, null, null);
        testRepository.deleteById(id);
        return "redirect:/admin/mock-test";
    }

    @PostMapping("/admin/questions")
    @Transactional
    public String createQuestion(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam Long testId,
            @RequestParam Integer part,
            @RequestParam(defaultValue = "MULTIPLE_CHOICE") String type,
            @RequestParam String content,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(required = false) String imageUrl,
            @RequestParam(required = false) String explanation,
            @RequestParam(required = false) String optionA,
            @RequestParam(required = false) String optionB,
            @RequestParam(required = false) String optionC,
            @RequestParam(required = false) String optionD,
            @RequestParam(required = false, defaultValue = "A") String correctOption,
            @RequestParam(required = false) String acceptedAnswer,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        Test test = testRepository.findById(testId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        Question question = new Question();
        question.setTest(test);
        question.setPart(part);
        question.setType(type);
        question.setContent(content);
        question.setAudioUrl(audioUrl);
        question.setImageUrl(imageUrl);
        question.setExplanation(explanation);
        applyWorkflow(question, status, sourceType, sourceNote, licenseNote, principal);
        Question saved = questionRepository.save(question);
        saveOption(saved, optionA, "A".equalsIgnoreCase(correctOption));
        saveOption(saved, optionB, "B".equalsIgnoreCase(correctOption));
        saveOption(saved, optionC, "C".equalsIgnoreCase(correctOption));
        saveOption(saved, optionD, "D".equalsIgnoreCase(correctOption));
        saveAcceptedAnswer(saved, acceptedAnswer);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/questions/{id}")
    @Transactional
    public String updateQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam Integer part,
            @RequestParam(defaultValue = "MULTIPLE_CHOICE") String type,
            @RequestParam String content,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(required = false) String imageUrl,
            @RequestParam(required = false) String explanation,
            @RequestParam(required = false) String optionA,
            @RequestParam(required = false) String optionB,
            @RequestParam(required = false) String optionC,
            @RequestParam(required = false) String optionD,
            @RequestParam(required = false, defaultValue = "A") String correctOption,
            @RequestParam(required = false) String acceptedAnswer,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
        question.setPart(part);
        question.setType(type);
        question.setContent(content);
        question.setAudioUrl(audioUrl);
        question.setImageUrl(imageUrl);
        question.setExplanation(explanation);
        applyWorkflow(question, status, sourceType, sourceNote, licenseNote, principal);
        Question saved = questionRepository.save(question);
        answerOptionRepository.deleteByQuestionId(id);
        acceptedAnswerRepository.deleteByQuestionId(id);
        saveOption(saved, optionA, "A".equalsIgnoreCase(correctOption));
        saveOption(saved, optionB, "B".equalsIgnoreCase(correctOption));
        saveOption(saved, optionC, "C".equalsIgnoreCase(correctOption));
        saveOption(saved, optionD, "D".equalsIgnoreCase(correctOption));
        saveAcceptedAnswer(saved, acceptedAnswer);
        writeAudit(principal, "QUESTION", id, "UPDATE", null, status, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/questions/{id}/publish")
    public String publishQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/content-review") String redirectTo) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
        ContentStatus fromStatus = question.getStatus();
        question.setStatus(ContentStatus.PUBLISHED);
        question.setReviewedBy(currentUser(principal));
        question.setReviewedAt(Instant.now());
        question.setPublishedAt(Instant.now());
        questionRepository.save(question);
        writeAudit(principal, "QUESTION", id, "PUBLISH", fromStatus, ContentStatus.PUBLISHED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/questions/{id}/archive")
    public String archiveQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
        ContentStatus fromStatus = question.getStatus();
        question.setStatus(ContentStatus.ARCHIVED);
        questionRepository.save(question);
        writeAudit(principal, "QUESTION", id, "ARCHIVE", fromStatus, ContentStatus.ARCHIVED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/questions/{id}/delete")
    @Transactional
    public String deleteQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/mock-test") String redirectTo) {
        writeAudit(principal, "QUESTION", id, "DELETE", null, null, null);
        acceptedAnswerRepository.deleteByQuestionId(id);
        answerOptionRepository.deleteByQuestionId(id);
        questionRepository.deleteById(id);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-sets")
    public String createVocabSet(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote) {
        VocabSet set = new VocabSet();
        set.setTitle(title);
        set.setTopic(topic);
        set.setLevel(level);
        applyWorkflow(set, status, sourceType, sourceNote, licenseNote, principal);
        vocabSetRepository.save(set);
        return "redirect:/admin/vocabulary";
    }

    @PostMapping("/admin/vocab-sets/{id}/publish")
    public String publishVocabSet(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabSet set = vocabSetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        ContentStatus fromStatus = set.getStatus();
        set.setStatus(ContentStatus.PUBLISHED);
        set.setReviewedBy(currentUser(principal));
        set.setReviewedAt(Instant.now());
        set.setPublishedAt(Instant.now());
        vocabSetRepository.save(set);
        writeAudit(principal, "VOCAB_SET", id, "PUBLISH", fromStatus, ContentStatus.PUBLISHED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-sets/{id}")
    public String updateVocabSet(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabSet set = vocabSetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        set.setTitle(title);
        set.setTopic(topic);
        set.setLevel(level);
        applyWorkflow(set, status, sourceType, sourceNote, licenseNote, principal);
        vocabSetRepository.save(set);
        writeAudit(principal, "VOCAB_SET", id, "UPDATE", null, status, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-sets/{id}/archive")
    public String archiveVocabSet(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabSet set = vocabSetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        ContentStatus fromStatus = set.getStatus();
        set.setStatus(ContentStatus.ARCHIVED);
        vocabSetRepository.save(set);
        writeAudit(principal, "VOCAB_SET", id, "ARCHIVE", fromStatus, ContentStatus.ARCHIVED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-sets/{id}/delete")
    public String deleteVocabSet(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        writeAudit(principal, "VOCAB_SET", id, "DELETE", null, null, null);
        vocabSetRepository.deleteById(id);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-words")
    public String createVocabWord(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam Long setId,
            @RequestParam String word,
            @RequestParam String meaning,
            @RequestParam(required = false) String phonetic,
            @RequestParam(required = false) String example,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote) {
        VocabSet set = vocabSetRepository.findById(setId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        VocabWord vocabWord = new VocabWord();
        vocabWord.setSet(set);
        vocabWord.setWord(word);
        vocabWord.setMeaning(meaning);
        vocabWord.setPhonetic(phonetic);
        vocabWord.setExample(example);
        vocabWord.setAudioUrl(audioUrl);
        applyWorkflow(vocabWord, status, sourceType, sourceNote, licenseNote, principal);
        vocabWordRepository.save(vocabWord);
        return "redirect:/admin/vocabulary";
    }

    @PostMapping("/admin/vocab-words/{id}/publish")
    public String publishVocabWord(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabWord word = vocabWordRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        ContentStatus fromStatus = word.getStatus();
        word.setStatus(ContentStatus.PUBLISHED);
        word.setReviewedBy(currentUser(principal));
        word.setReviewedAt(Instant.now());
        word.setPublishedAt(Instant.now());
        vocabWordRepository.save(word);
        writeAudit(principal, "VOCAB_WORD", id, "PUBLISH", fromStatus, ContentStatus.PUBLISHED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-words/{id}")
    public String updateVocabWord(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam Long setId,
            @RequestParam String word,
            @RequestParam String meaning,
            @RequestParam(required = false) String phonetic,
            @RequestParam(required = false) String example,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabSet set = vocabSetRepository.findById(setId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        VocabWord vocabWord = vocabWordRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        vocabWord.setSet(set);
        vocabWord.setWord(word);
        vocabWord.setMeaning(meaning);
        vocabWord.setPhonetic(phonetic);
        vocabWord.setExample(example);
        vocabWord.setAudioUrl(audioUrl);
        applyWorkflow(vocabWord, status, sourceType, sourceNote, licenseNote, principal);
        vocabWordRepository.save(vocabWord);
        writeAudit(principal, "VOCAB_WORD", id, "UPDATE", null, status, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-words/{id}/archive")
    public String archiveVocabWord(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        VocabWord word = vocabWordRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        ContentStatus fromStatus = word.getStatus();
        word.setStatus(ContentStatus.ARCHIVED);
        vocabWordRepository.save(word);
        writeAudit(principal, "VOCAB_WORD", id, "ARCHIVE", fromStatus, ContentStatus.ARCHIVED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/vocab-words/{id}/delete")
    public String deleteVocabWord(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/vocabulary") String redirectTo) {
        writeAudit(principal, "VOCAB_WORD", id, "DELETE", null, null, null);
        vocabWordRepository.deleteById(id);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/lessons")
    public String createLesson(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam String content,
            @RequestParam(required = false) String videoUrl,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote) {
        Lesson lesson = new Lesson();
        lesson.setTitle(title);
        lesson.setTopic(topic);
        lesson.setContent(content);
        lesson.setVideoUrl(videoUrl);
        applyWorkflow(lesson, status, sourceType, sourceNote, licenseNote, principal);
        lessonRepository.save(lesson);
        return "redirect:/admin/reading";
    }

    @PostMapping("/admin/lessons/{id}")
    public String updateLesson(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam String content,
            @RequestParam(required = false) String videoUrl,
            @RequestParam(defaultValue = "DRAFT") ContentStatus status,
            @RequestParam(defaultValue = "MANUAL") SourceType sourceType,
            @RequestParam(required = false) String sourceNote,
            @RequestParam(required = false) String licenseNote,
            @RequestParam(defaultValue = "/admin/reading") String redirectTo) {
        Lesson lesson = lessonRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found"));
        lesson.setTitle(title);
        lesson.setTopic(topic);
        lesson.setContent(content);
        lesson.setVideoUrl(videoUrl);
        applyWorkflow(lesson, status, sourceType, sourceNote, licenseNote, principal);
        lessonRepository.save(lesson);
        writeAudit(principal, "LESSON", id, "UPDATE", null, status, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/lessons/{id}/publish")
    public String publishLesson(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/reading") String redirectTo) {
        Lesson lesson = lessonRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found"));
        ContentStatus fromStatus = lesson.getStatus();
        lesson.setStatus(ContentStatus.PUBLISHED);
        lesson.setReviewedBy(currentUser(principal));
        lesson.setReviewedAt(Instant.now());
        lesson.setPublishedAt(Instant.now());
        lessonRepository.save(lesson);
        writeAudit(principal, "LESSON", id, "PUBLISH", fromStatus, ContentStatus.PUBLISHED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/lessons/{id}/archive")
    public String archiveLesson(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/reading") String redirectTo) {
        Lesson lesson = lessonRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found"));
        ContentStatus fromStatus = lesson.getStatus();
        lesson.setStatus(ContentStatus.ARCHIVED);
        lessonRepository.save(lesson);
        writeAudit(principal, "LESSON", id, "ARCHIVE", fromStatus, ContentStatus.ARCHIVED, null);
        return "redirect:" + redirectTo;
    }

    @PostMapping("/admin/lessons/{id}/delete")
    public String deleteLesson(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam(defaultValue = "/admin/reading") String redirectTo) {
        writeAudit(principal, "LESSON", id, "DELETE", null, null, null);
        lessonRepository.deleteById(id);
        return "redirect:" + redirectTo;
    }

    private void addAdminLists(Model model) {
        model.addAttribute("tests", testRepository.findAll(RECENT).getContent());
        model.addAttribute("questions", questionRepository.findAll(RECENT).getContent());
        model.addAttribute("vocabSets", vocabSetRepository.findAll(RECENT).getContent());
        model.addAttribute("vocabWords", vocabWordRepository.findAll(RECENT).getContent());
        model.addAttribute("lessons", lessonRepository.findAll(RECENT).getContent());
        model.addAttribute("statuses", ContentStatus.values());
        model.addAttribute("sourceTypes", SourceType.values());
    }

    private long pendingContentCount() {
        return testRepository.countByStatus(ContentStatus.PENDING_REVIEW)
                + questionRepository.countByStatus(ContentStatus.PENDING_REVIEW)
                + lessonRepository.countByStatus(ContentStatus.PENDING_REVIEW)
                + vocabSetRepository.countByStatus(ContentStatus.PENDING_REVIEW)
                + vocabWordRepository.countByStatus(ContentStatus.PENDING_REVIEW);
    }

    private User currentUser(AppUserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        return userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private void writeAudit(
            AppUserPrincipal principal,
            String targetType,
            Long targetId,
            String action,
            ContentStatus fromStatus,
            ContentStatus toStatus,
            String note) {
        ContentAuditLog log = new ContentAuditLog();
        log.setActor(currentUser(principal));
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setAction(action);
        log.setFromStatus(fromStatus == null ? null : fromStatus.name());
        log.setToStatus(toStatus == null ? null : toStatus.name());
        log.setNote(note);
        contentAuditLogRepository.save(log);
    }

    private String optionContent(Long questionId, int index) {
        var options = answerOptionRepository.findByQuestionIdOrderByIdAsc(questionId);
        if (index >= options.size()) {
            return "";
        }
        return options.get(index).getContent();
    }

    private String correctOption(Long questionId) {
        var options = answerOptionRepository.findByQuestionIdOrderByIdAsc(questionId);
        String[] labels = {"A", "B", "C", "D"};
        for (int i = 0; i < options.size() && i < labels.length; i++) {
            if (Boolean.TRUE.equals(options.get(i).getCorrect())) {
                return labels[i];
            }
        }
        return "A";
    }

    private String acceptedAnswerContent(Long questionId) {
        var acceptedAnswers = acceptedAnswerRepository.findByQuestionIdOrderByIdAsc(questionId);
        if (acceptedAnswers.isEmpty()) {
            return "";
        }
        return acceptedAnswers.get(0).getAnswerText();
    }

    private void saveOption(Question question, String content, boolean correct) {
        if (!StringUtils.hasText(content)) {
            return;
        }
        AnswerOption option = new AnswerOption();
        option.setQuestion(question);
        option.setContent(content);
        option.setCorrect(correct);
        answerOptionRepository.save(option);
    }

    private void saveAcceptedAnswer(Question question, String answerText) {
        if (!StringUtils.hasText(answerText)) {
            return;
        }
        AcceptedAnswer answer = new AcceptedAnswer();
        answer.setQuestion(question);
        answer.setAnswerText(answerText);
        acceptedAnswerRepository.save(answer);
    }

    private void applyWorkflow(
            Test content,
            ContentStatus status,
            SourceType sourceType,
            String sourceNote,
            String licenseNote,
            AppUserPrincipal principal) {
        content.setStatus(status);
        content.setSourceType(sourceType);
        content.setSourceNote(sourceNote);
        content.setLicenseNote(licenseNote);
        if (status == ContentStatus.PUBLISHED) {
            content.setReviewedBy(currentUser(principal));
            content.setReviewedAt(Instant.now());
            content.setPublishedAt(Instant.now());
        }
    }

    private void applyWorkflow(
            Question content,
            ContentStatus status,
            SourceType sourceType,
            String sourceNote,
            String licenseNote,
            AppUserPrincipal principal) {
        content.setStatus(status);
        content.setSourceType(sourceType);
        content.setSourceNote(sourceNote);
        content.setLicenseNote(licenseNote);
        if (status == ContentStatus.PUBLISHED) {
            content.setReviewedBy(currentUser(principal));
            content.setReviewedAt(Instant.now());
            content.setPublishedAt(Instant.now());
        }
    }

    private void applyWorkflow(
            VocabSet content,
            ContentStatus status,
            SourceType sourceType,
            String sourceNote,
            String licenseNote,
            AppUserPrincipal principal) {
        content.setStatus(status);
        content.setSourceType(sourceType);
        content.setSourceNote(sourceNote);
        content.setLicenseNote(licenseNote);
        if (status == ContentStatus.PUBLISHED) {
            content.setReviewedBy(currentUser(principal));
            content.setReviewedAt(Instant.now());
            content.setPublishedAt(Instant.now());
        }
    }

    private void applyWorkflow(
            VocabWord content,
            ContentStatus status,
            SourceType sourceType,
            String sourceNote,
            String licenseNote,
            AppUserPrincipal principal) {
        content.setStatus(status);
        content.setSourceType(sourceType);
        content.setSourceNote(sourceNote);
        content.setLicenseNote(licenseNote);
        if (status == ContentStatus.PUBLISHED) {
            content.setReviewedBy(currentUser(principal));
            content.setReviewedAt(Instant.now());
            content.setPublishedAt(Instant.now());
        }
    }

    private void applyWorkflow(
            Lesson content,
            ContentStatus status,
            SourceType sourceType,
            String sourceNote,
            String licenseNote,
            AppUserPrincipal principal) {
        content.setStatus(status);
        content.setSourceType(sourceType);
        content.setSourceNote(sourceNote);
        content.setLicenseNote(licenseNote);
        if (status == ContentStatus.PUBLISHED) {
            content.setReviewedBy(currentUser(principal));
            content.setReviewedAt(Instant.now());
            content.setPublishedAt(Instant.now());
        }
    }
}
