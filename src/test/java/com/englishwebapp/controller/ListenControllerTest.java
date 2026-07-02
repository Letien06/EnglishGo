package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.DauToeicDifficultySessionResponse;
import com.englishwebapp.dto.DauToeicPracticeItemResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.LearnerContentService;
import com.englishwebapp.service.ListeningProgressService;
import com.englishwebapp.service.VocabService;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ListenController.class)
@AutoConfigureMockMvc(addFilters = false)
class ListenControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LearnerContentService learnerContentService;

    @MockBean
    private DauToeicClientService dauToeicClientService;

    @MockBean
    private ListeningProgressService listeningProgressService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @MockBean
    private VocabService vocabService;

    @BeforeEach
    void setUp() {
        when(learnerContentService.findPublishedQuestions(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        when(learnerContentService.findOptionsByQuestionId(any())).thenReturn(Map.of());
    }

    @Test
    void listenPageRendersDauToeicLevelDashboard() throws Exception {
        List<DauToeicDifficultyLevelResponse> levels = List.of(new DauToeicDifficultyLevelResponse(
                        2,
                        1,
                        "Level 1 - De",
                        0.01,
                        0.14,
                        347,
                        0,
                        0,
                        0,
                        347,
                        1000,
                        120));
        when(dauToeicClientService.listDifficultyLevels(2)).thenReturn(levels);
        when(listeningProgressService.applyProgress(null, levels)).thenReturn(levels);

        mockMvc.perform(get("/listen").param("part", "2"))
                .andExpect(status().isOk())
                .andExpect(view().name("listen/index"))
                .andExpect(content().string(Matchers.containsString("listen-page")))
                .andExpect(content().string(Matchers.containsString("Chọn cấp độ luyện nghe")))
                .andExpect(content().string(Matchers.containsString("Level 1")));
    }

    @Test
    void practicePageRendersDauToeicSession() throws Exception {
        DauToeicQuestionResponse question = new DauToeicQuestionResponse(
                "question-1",
                "test-1",
                null,
                1,
                "listening",
                1,
                "https://example.com/audio.mp3",
                "https://example.com/image.jpg",
                "The woman is working.",
                null,
                "The woman is working.",
                "The woman is driving.",
                "The woman is cooking.",
                "The woman is reading.",
                "A",
                null,
                null,
                3,
                1,
                "Nguoi phu nu dang lam viec.",
                null,
                null);
        when(dauToeicClientService.getDifficultySession(anyInt(), anyInt(), any()))
                .thenReturn(new DauToeicDifficultySessionResponse(
                        1,
                        1,
                        "Level 1 - De",
                        1,
                        List.of(new DauToeicPracticeItemResponse(
                                "question-1",
                                "question",
                                1,
                                1,
                                0.02,
                                300,
                                6,
                                "https://example.com/audio.mp3",
                                "https://example.com/image.jpg",
                                "The woman is working.",
                                "Nguoi phu nu dang lam viec.",
                                null,
                                List.of(question)))));

        mockMvc.perform(get("/listen/practice")
                        .param("part", "1")
                        .param("level", "1")
                        .param("mode", "flip")
                        .param("assist", "30"))
                .andExpect(status().isOk())
                .andExpect(view().name("listen/practice"))
                .andExpect(content().string(Matchers.containsString("Part 1")))
                .andExpect(content().string(Matchers.containsString("Luyện nghe")))
                .andExpect(content().string(Matchers.containsString("practice-inline-mode-tools")))
                .andExpect(content().string(Matchers.containsString("answer-option-text")))
                .andExpect(content().string(Matchers.containsString("practice-bottom-nav")))
                .andExpect(content().string(Matchers.containsString("50%")))
                .andExpect(content().string(Matchers.containsString("100%")))
                .andExpect(content().string(Matchers.not(Matchers.containsString("10%"))))
                .andExpect(content().string(Matchers.containsString("The woman is working.")));
    }
}
