package com.englishwebapp.config;

import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String mediaBaseUrl;
    private String uploadDir = "uploads";
    private List<String> adminEmails = new ArrayList<>();
    private Firebase firebase = new Firebase();
    private Gemini gemini = new Gemini();
    private DauToeic dautoeic = new DauToeic();

    @Getter
    @Setter
    public static class Firebase {
        private String serviceAccountPath;
        private String serviceAccountJson;
        private String webApiKey;
        private String authDomain;
        private String projectId;
        private String appId;
    }

    @Getter
    @Setter
    public static class Gemini {
        private String apiKey;
        private String model = "gemini-2.5-flash";
        private String baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    }

    @Getter
    @Setter
    public static class DauToeic {
        private String supabaseUrl = "https://qfhmnlvgweznzcsoijyr.supabase.co";
        private String anonKey = "";
        private String mediaBaseUrl = "https://qfhmnlvgweznzcsoijyr.supabase.co/storage/v1/object/public/mock-test-media";
    }
}
