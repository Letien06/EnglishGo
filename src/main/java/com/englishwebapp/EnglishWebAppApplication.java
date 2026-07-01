package com.englishwebapp;

import com.englishwebapp.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class EnglishWebAppApplication {

    public static void main(String[] args) {
        SpringApplication.run(EnglishWebAppApplication.class, args);
    }
}
