package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.service.firestore.FirestoreSupport;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HubServiceTest {

    @Mock
    private DashboardService dashboardService;

    @Mock
    private FirestoreSupport firestoreSupport;

    @Mock
    private VocabService vocabService;

    @InjectMocks
    private HubService hubService;

    @Test
    void hubRendersForFirestoreSessionWithoutSqlUserRow() {
        AppUserPrincipal principal = new AppUserPrincipal(
                42L,
                "firebase-user",
                "learner@example.com",
                "Learner",
                UserRole.STUDENT);
        when(dashboardService.getSummary("firebase-user")).thenReturn(new DashboardSummary(
                0,
                BigDecimal.ZERO,
                0,
                0,
                List.of(),
                List.of()));
        when(dashboardService.countCompletedToday("firebase-user")).thenReturn(0L);
        when(vocabService.totalWords()).thenReturn(12L);

        var hub = hubService.getHub(principal);

        assertThat(hub.greetingName()).isEqualTo("Learner");
        assertThat(hub.targetScore()).isNull();
        assertThat(hub.level()).isNull();
        assertThat(hub.availableTests()).isZero();
        assertThat(hub.availableQuestions()).isZero();
        assertThat(hub.vocabularyWords()).isEqualTo(12);
    }
}
