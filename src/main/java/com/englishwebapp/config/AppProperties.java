package com.englishwebapp.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String mediaBaseUrl;
    private Firebase firebase = new Firebase();

    @Getter
    @Setter
    public static class Firebase {
        private String serviceAccountPath;
        private String webApiKey;
        private String authDomain;
        private String projectId;
        private String appId;
    }
}
