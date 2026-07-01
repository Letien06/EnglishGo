package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.AcceptedAnswer;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
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
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.AdminContentGenerationService;
import com.englishwebapp.service.AdminContentImportService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import java.util.List;
import java.util.Optional;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AdminContentController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminContentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TestRepository testRepository;

    @MockBean
    private QuestionRepository questionRepository;

    @MockBean
    private AnswerOptionRepository answerOptionRepository;

    @MockBean
    private AcceptedAnswerRepository acceptedAnswerRepository;

    @MockBean
    private VocabSetRepository vocabSetRepository;

    @MockBean
    private VocabWordRepository vocabWordRepository;

    @MockBean
    private LessonRepository lessonRepository;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private QuestionGroupRepository questionGroupRepository;

    @MockBean
    private MediaAssetRepository mediaAssetRepository;

    @MockBean
    private ContentAuditLogRepository contentAuditLogRepository;

    @MockBean
    private AdminContentGenerationService contentGenerationService;

    @MockBean
    private AdminContentImportService contentImportService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @BeforeEach
    void setUp() {
        when(testRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(testRepository.findByStatus(any(ContentStatus.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(questionRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(questionRepository.findByStatus(any(ContentStatus.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(vocabSetRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(vocabSetRepository.findByStatus(any(ContentStatus.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(vocabWordRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(vocabWordRepository.findByStatus(any(ContentStatus.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(lessonRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(lessonRepository.findByStatus(any(ContentStatus.class), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(userRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(user())));
    }

    @Test
    void readingAdminPageRendersLessonAndQuestionForms() throws Exception {
        mockMvc.perform(get("/admin/reading"))
                .andExpect(status().isOk())
                .andExpect(view().name("admin/content"))
                .andExpect(content().string(Matchers.containsString("/admin/lessons")))
                .andExpect(content().string(Matchers.containsString("/admin/questions")));
    }

    @Test
    void workflowPageRendersGenerateAndImportForms() throws Exception {
        mockMvc.perform(get("/admin/generate"))
                .andExpect(status().isOk())
                .andExpect(view().name("admin/workflow"))
                .andExpect(content().string(Matchers.containsString("/admin/generate/questions")))
                .andExpect(content().string(Matchers.containsString("/admin/import/file")));
    }

    @Test
    void usersPageRendersRoleManagement() throws Exception {
        mockMvc.perform(get("/admin/users"))
                .andExpect(status().isOk())
                .andExpect(view().name("admin/users"))
                .andExpect(content().string(Matchers.containsString("/admin/users/5/role")))
                .andExpect(content().string(Matchers.containsString("admin@example.com")))
                .andExpect(content().string(Matchers.containsString("ADMIN")));
    }

    @Test
    void questionEditPageRendersOptionsAndAnswerFields() throws Exception {
        com.englishwebapp.entity.Test test = test();
        Question question = new Question();
        question.setId(7L);
        question.setTest(test);
        question.setPart(5);
        question.setType("MULTIPLE_CHOICE");
        question.setContent("Choose the best answer.");
        question.setStatus(ContentStatus.PENDING_REVIEW);
        when(testRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(test)));
        when(questionRepository.findById(7L)).thenReturn(Optional.of(question));
        when(answerOptionRepository.findByQuestionIdOrderByIdAsc(7L)).thenReturn(List.of(
                option("A", false),
                option("B", true),
                option("C", false),
                option("D", false)));
        AcceptedAnswer acceptedAnswer = new AcceptedAnswer();
        acceptedAnswer.setAnswerText("accepted");
        when(acceptedAnswerRepository.findByQuestionIdOrderByIdAsc(7L)).thenReturn(List.of(acceptedAnswer));

        mockMvc.perform(get("/admin/questions/7/edit"))
                .andExpect(status().isOk())
                .andExpect(view().name("admin/edit"))
                .andExpect(content().string(Matchers.containsString("/admin/questions/7")))
                .andExpect(content().string(Matchers.containsString("Choose the best answer.")))
                .andExpect(content().string(Matchers.containsString("accepted")));
    }

    @Test
    void vocabWordEditPageRendersSetPicker() throws Exception {
        VocabSet set = vocabSet();
        VocabWord word = new VocabWord();
        word.setId(9L);
        word.setSet(set);
        word.setWord("contract");
        word.setMeaning("hợp đồng");
        word.setStatus(ContentStatus.PENDING_REVIEW);
        when(vocabSetRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(set)));
        when(vocabWordRepository.findById(9L)).thenReturn(Optional.of(word));

        mockMvc.perform(get("/admin/vocab-words/9/edit"))
                .andExpect(status().isOk())
                .andExpect(view().name("admin/edit"))
                .andExpect(content().string(Matchers.containsString("/admin/vocab-words/9")))
                .andExpect(content().string(Matchers.containsString("contract")))
                .andExpect(content().string(Matchers.containsString("hợp đồng")));
    }

    private com.englishwebapp.entity.Test test() {
        com.englishwebapp.entity.Test test = new com.englishwebapp.entity.Test();
        test.setId(1L);
        test.setTitle("Draft test");
        test.setType("TOEIC");
        test.setDuration(120);
        test.setStatus(ContentStatus.PENDING_REVIEW);
        return test;
    }

    private AnswerOption option(String content, boolean correct) {
        AnswerOption option = new AnswerOption();
        option.setContent(content);
        option.setCorrect(correct);
        return option;
    }

    private VocabSet vocabSet() {
        VocabSet set = new VocabSet();
        set.setId(2L);
        set.setTitle("Business words");
        set.setTopic("TOEIC");
        set.setStatus(ContentStatus.PENDING_REVIEW);
        return set;
    }

    private User user() {
        User user = new User();
        user.setId(5L);
        user.setFirebaseUid("firebase-admin");
        user.setEmail("admin@example.com");
        user.setDisplayName("Admin");
        user.setRole(UserRole.ADMIN);
        return user;
    }
}
