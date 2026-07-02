package com.englishwebapp.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.cloud.FirestoreClient;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class FirebaseConfig {

    @Bean
    @Lazy
    @Conditional(FirebaseCredentialsCondition.class)
    public FirebaseApp firebaseApp(AppProperties appProperties) throws IOException {
        try (InputStream serviceAccount = openServiceAccount(appProperties)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();

            if (FirebaseApp.getApps().isEmpty()) {
                return FirebaseApp.initializeApp(options);
            }
            return FirebaseApp.getInstance();
        }
    }

    @Bean
    @Lazy
    @ConditionalOnBean(FirebaseApp.class)
    public FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }

    @Bean
    @Lazy
    @ConditionalOnBean(FirebaseApp.class)
    public Firestore firestore(FirebaseApp firebaseApp) {
        return FirestoreClient.getFirestore(firebaseApp);
    }

    private InputStream openServiceAccount(AppProperties appProperties) throws IOException {
        String serviceAccountJson = appProperties.getFirebase().getServiceAccountJson();
        if (StringUtils.hasText(serviceAccountJson)) {
            return new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));
        }
        return new FileInputStream(appProperties.getFirebase().getServiceAccountPath());
    }

    static class FirebaseCredentialsCondition implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            Environment environment = context.getEnvironment();
            return StringUtils.hasText(environment.getProperty("app.firebase.service-account-path"))
                    || StringUtils.hasText(environment.getProperty("app.firebase.service-account-json"));
        }
    }
}
