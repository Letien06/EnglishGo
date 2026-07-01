package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.LearnerContentService;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
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
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @BeforeEach
    void setUp() {
        when(learnerContentService.findPublishedQuestions(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        when(learnerContentService.findOptionsByQuestionId(any())).thenReturn(Map.of());
    }

    @Test
    void listenPageRendersPublishedContentEmptyState() throws Exception {
        mockMvc.perform(get("/listen").param("part", "2"))
                .andExpect(status().isOk())
                .andExpect(view().name("listen/index"))
                .andExpect(content().string(Matchers.containsString("listen-page")))
                .andExpect(content().string(Matchers.containsString("Chưa có dữ liệu đã duyệt")));
    }
}
