package com.englishwebapp.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * In-memory cache for DauToeic API responses.
 *
 * <p>Problem: every page navigation or F5 triggers fresh HTTP calls to the
 * external Supabase/DauToeic API, causing 1-3 s latency per page load.
 *
 * <p>Solution: cache the API responses server-side with Caffeine for a
 * configurable TTL (default 10 min). The data (question banks, practice
 * stats, difficulty levels) changes infrequently, so a short TTL is safe
 * and dramatically reduces perceived load time on repeated navigations.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .maximumSize(200)
                .recordStats());
        return manager;
    }
}
