package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.PracticeQueryService;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PracticePageController.class)
@AutoConfigureMockMvc(addFilters = false)
class PracticePageControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PracticeQueryService practiceQueryService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @BeforeEach
    void setUp() {
        when(practiceQueryService.findTests(isNull(), isNull(), any()))
                .thenReturn(new PageImpl<>(List.of(test(1L, "Test 1"))));
    }

    @Test
    void mockTestPageRendersCardLayout() throws Exception {
        mockMvc.perform(get("/mock-test"))
                .andExpect(status().isOk())
                .andExpect(view().name("practice/tests"))
                .andExpect(content().string(Matchers.containsString("mock-hero")))
                .andExpect(content().string(Matchers.containsString("mock-card")))
                .andExpect(content().string(Matchers.not(Matchers.containsString("upgrade-button"))))
                .andExpect(content().string(Matchers.not(Matchers.containsString(">Video<"))))
                .andExpect(content().string(Matchers.not(Matchers.containsString(">More<"))));
    }

    private com.englishwebapp.entity.Test test(Long id, String title) {
        com.englishwebapp.entity.Test test = new com.englishwebapp.entity.Test();
        test.setId(id);
        test.setTitle(title);
        test.setType("TOEIC");
        test.setDuration(120);
        test.setDifficulty("ETS 2026");
        test.setVersion(1);
        return test;
    }
}
