package com.englishwebapp.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.DauToeicClientService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.VocabService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(DauToeicController.class)
@AutoConfigureMockMvc(addFilters = false)
class DauToeicControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DauToeicClientService dauToeicClientService;

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
}
