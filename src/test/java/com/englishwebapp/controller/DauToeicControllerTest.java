package com.englishwebapp.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.DauToeicDifficultySessionResponse;
import com.englishwebapp.dto.DauToeicPracticeItemResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.ListeningProgressService;
import com.englishwebapp.service.ReadingProgressService;
import com.englishwebapp.service.VocabService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(DauToeicController.class)
@AutoConfigureMockMvc(addFilters = false)
class DauToeicControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DauToeicClientService dauToeicClientService;

    @MockBean
    private ListeningProgressService listeningProgressService;

    @MockBean
    private ReadingProgressService readingProgressService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @MockBean
    private VocabService vocabService;

    @Test
    void readingEndpointReturnsPartPayload() throws Exception {
        DauToeicTestResponse test = new DauToeicTestResponse(
                "test-1",
                "set-1",
                "ETS 2026",
                "Test 1",
                null,
                "ETS",
                null,
                3,
                200,
                2700,
                4500,
                true,
                false,
                0,
                "2026/test_1",
                1);
        DauToeicQuestionResponse question = new DauToeicQuestionResponse(
                "question-1",
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
                2,
                0,
                "Van phong mo cua luc chin gio.",
                "office (n) van phong",
                null);
        when(dauToeicClientService.getReadingPart("test-1", 5))
                .thenReturn(new DauToeicPartResponse(test, 5, "reading", List.of(), List.of(question)));

        mockMvc.perform(get("/api/dautoeic/tests/test-1/reading").param("part", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.test.id").value("test-1"))
                .andExpect(jsonPath("$.data.part").value(5))
                .andExpect(jsonPath("$.data.questions[0].questionNumber").value(101))
                .andExpect(jsonPath("$.data.questions[0].correctAnswer").value("A"));
    }

    @Test
    void difficultyLevelEndpointReturnsLevelCards() throws Exception {
        List<DauToeicDifficultyLevelResponse> levels = List.of(new DauToeicDifficultyLevelResponse(
                        1,
                        1,
                        "Level 1 - De",
                        0.01,
                        0.14,
                        90,
                        0,
                        0,
                        0,
                        90,
                        1000,
                        120));
        when(dauToeicClientService.listDifficultyLevels(1)).thenReturn(levels);
        when(listeningProgressService.applyProgress(null, levels)).thenReturn(levels);

        mockMvc.perform(get("/api/dautoeic/difficulty/parts/1/levels"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].part").value(1))
                .andExpect(jsonPath("$.data[0].level").value(1))
                .andExpect(jsonPath("$.data[0].total").value(90));
    }

    @Test
    void difficultySessionEndpointReturnsPracticeItems() throws Exception {
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
        when(dauToeicClientService.getDifficultySession(1, 1, 10))
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

        mockMvc.perform(get("/api/dautoeic/difficulty/parts/1/levels/1").param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.items[0].id").value("question-1"))
                .andExpect(jsonPath("$.data.items[0].questions[0].correctAnswer").value("A"));
    }

    @Test
    void readingDifficultyLevelEndpointReturnsLevelCards() throws Exception {
        List<DauToeicDifficultyLevelResponse> levels = List.of(new DauToeicDifficultyLevelResponse(
                5,
                1,
                "Level 1 - De",
                0.01,
                0.14,
                100,
                0,
                0,
                0,
                100,
                1200,
                80));
        when(dauToeicClientService.listReadingDifficultyLevels(5)).thenReturn(levels);
        when(readingProgressService.applyProgress(null, levels)).thenReturn(levels);

        mockMvc.perform(get("/api/dautoeic/reading/parts/5/levels"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].part").value(5))
                .andExpect(jsonPath("$.data[0].level").value(1))
                .andExpect(jsonPath("$.data[0].total").value(100));
    }

    @Test
    void readingDifficultySessionEndpointReturnsPracticeItems() throws Exception {
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
        when(dauToeicClientService.getReadingDifficultySession(5, 1, 10))
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

        mockMvc.perform(get("/api/dautoeic/reading/parts/5/levels/1").param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.part").value(5))
                .andExpect(jsonPath("$.data.items[0].questions[0].correctAnswer").value("A"));
    }

    @Test
    void readingDifficultySessionEndpointReturnsPassageItems() throws Exception {
        DauToeicQuestionResponse question = new DauToeicQuestionResponse(
                "question-7",
                "test-1",
                "passage-7",
                7,
                "reading",
                147,
                null,
                null,
                null,
                "What is the notice mainly about?",
                "A schedule change",
                "A hiring plan",
                "A product launch",
                "A travel policy",
                "A",
                "Thong bao noi ve thay doi lich.",
                null,
                3,
                1,
                "Thong bao chu yeu noi ve dieu gi?",
                "notice (n) thong bao",
                null);
        when(dauToeicClientService.getReadingDifficultySession(7, 3, 5))
                .thenReturn(new DauToeicDifficultySessionResponse(
                        7,
                        3,
                        "Level 3 - Trung binh",
                        1,
                        List.of(new DauToeicPracticeItemResponse(
                                "passage-7",
                                "passage",
                                7,
                                3,
                                0.25,
                                120,
                                30,
                                null,
                                null,
                                "Office notice passage",
                                "Ban dich doan doc",
                                "notice (n) thong bao",
                                List.of(question)))));

        mockMvc.perform(get("/api/dautoeic/reading/parts/7/levels/3").param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.part").value(7))
                .andExpect(jsonPath("$.data.items[0].itemType").value("passage"))
                .andExpect(jsonPath("$.data.items[0].questions[0].passageId").value("passage-7"));
    }

    @Test
    void readingDifficultyLevelEndpointRejectsInvalidPart() throws Exception {
        when(dauToeicClientService.listReadingDifficultyLevels(4))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reading part must be between 5 and 7"));

        mockMvc.perform(get("/api/dautoeic/reading/parts/4/levels"))
                .andExpect(status().isBadRequest());
    }
}
