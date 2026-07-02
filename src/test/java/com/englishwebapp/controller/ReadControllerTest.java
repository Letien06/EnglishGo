package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.DauToeicDifficultySessionResponse;
import com.englishwebapp.dto.DauToeicPracticeItemResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.ReadingProgressService;
import com.englishwebapp.service.VocabService;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ReadController.class)
@AutoConfigureMockMvc(addFilters = false)
class ReadControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @MockBean
    private DauToeicClientService dauToeicClientService;

    @MockBean
    private ReadingProgressService readingProgressService;

    @MockBean
    private VocabService vocabService;

    @BeforeEach
    void setUp() {
        when(readingProgressService.applyProgress(any(), any())).thenAnswer(invocation -> invocation.getArgument(1));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void readPageRedirectsGuestsToLogin() throws Exception {
        mockMvc.perform(get("/read"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login"));
    }

    @Test
    void readPageRendersAuthenticatedHeader() throws Exception {
        AppUserPrincipal principal = new AppUserPrincipal(
                1L,
                "firebase-user",
                "learner@example.com",
                "Learner",
                UserRole.STUDENT);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of());

        SecurityContextHolder.getContext().setAuthentication(authentication);

        mockMvc.perform(get("/read").param("part", "part7"))
                .andExpect(status().isOk())
                .andExpect(view().name("read/index"))
                .andExpect(content().string(Matchers.containsString("dash-actions")))
                .andExpect(content().string(Matchers.containsString("read-hero-card")));
    }

    @Test
    void readPageRendersDauToeicLevelDashboardForPartFive() throws Exception {
        authenticateLearner();
        when(dauToeicClientService.listReadingDifficultyLevels(5))
                .thenReturn(List.of(new DauToeicDifficultyLevelResponse(
                        5,
                        1,
                        "Level 1 - De",
                        0.01,
                        0.14,
                        20,
                        0,
                        0,
                        0,
                        20,
                        200,
                        10)));

        mockMvc.perform(get("/read").param("part", "part5"))
                .andExpect(status().isOk())
                .andExpect(view().name("read/index"))
                .andExpect(content().string(Matchers.containsString("Chọn cấp độ luyện đọc")))
                .andExpect(content().string(Matchers.containsString("/read/practice?part=5")));
    }

    @Test
    void readPracticePageRedirectsGuestsToLogin() throws Exception {
        mockMvc.perform(get("/read/practice").param("part", "5").param("level", "1"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login"));
    }

    @Test
    void readPracticePageRendersDauToeicSession() throws Exception {
        authenticateLearner();
        DauToeicQuestionResponse question = new DauToeicQuestionResponse(
                "question-5",
                "test-1",
                null,
                5,
                "reading",
                101,
                null,
                null,
                null,
                "The office ------- at nine.",
                "opens",
                "opening",
                "open",
                "opened",
                "A",
                "Can dong tu chia hien tai don.",
                null,
                1,
                1,
                "Van phong mo cua luc chin gio.",
                "office (n) van phong",
                null);
        when(dauToeicClientService.getReadingDifficultySession(5, 1, 20))
                .thenReturn(new DauToeicDifficultySessionResponse(
                        5,
                        1,
                        "Level 1 - De",
                        1,
                        List.of(new DauToeicPracticeItemResponse(
                                "question-5",
                                "question",
                                5,
                                1,
                                0.02,
                                300,
                                6,
                                null,
                                null,
                                "The office ------- at nine.",
                                "Van phong mo cua luc chin gio.",
                                "office (n) van phong",
                                List.of(question)))));

        mockMvc.perform(get("/read/practice").param("part", "5").param("level", "1"))
                .andExpect(status().isOk())
                .andExpect(view().name("read/practice"))
                .andExpect(content().string(Matchers.containsString("read-practice-page")))
                .andExpect(content().string(Matchers.containsString("The office ------- at nine.")));
    }

    private void authenticateLearner() {
        AppUserPrincipal principal = new AppUserPrincipal(
                1L,
                "firebase-user",
                "learner@example.com",
                "Learner",
                UserRole.STUDENT);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of()));
    }
}
