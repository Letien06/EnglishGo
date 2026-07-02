package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.englishwebapp.dto.ReadingProgressResponse;
import com.englishwebapp.dto.ReadingToolResponse;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.ReadingProgressService;
import com.englishwebapp.service.ReadingToolService;
import com.englishwebapp.service.VocabService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ReadingProgressController.class)
@AutoConfigureMockMvc(addFilters = false)
class ReadingProgressControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ReadingProgressService readingProgressService;

    @MockBean
    private ReadingToolService readingToolService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @MockBean
    private VocabService vocabService;

    @Test
    void progressEndpointReturnsSavedState() throws Exception {
        when(readingProgressService.record(isNull(), any()))
                .thenReturn(new ReadingProgressResponse(false, false, true));

        mockMvc.perform(post("/api/reading/progress")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "part": 5,
                                  "level": 1,
                                  "itemId": "item-1",
                                  "questionId": "question-1",
                                  "selectedAnswer": "A",
                                  "correctAnswer": "A",
                                  "modeUsed": "normal",
                                  "assistPercent": 30,
                                  "elapsedSeconds": 12
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.saved").value(false))
                .andExpect(jsonPath("$.data.correct").value(true));
    }

    @Test
    void favoriteEndpointReturnsToggleState() throws Exception {
        when(readingToolService.toggleFavorite(isNull(), any()))
                .thenReturn(new ReadingToolResponse(false, false, null, "Dang nhap de luu yeu thich."));

        mockMvc.perform(post("/api/reading/favorites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "part": 5,
                                  "level": 1,
                                  "itemId": "item-1",
                                  "questionId": "question-1"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.saved").value(false))
                .andExpect(jsonPath("$.data.message").value("Dang nhap de luu yeu thich."));
    }
}
