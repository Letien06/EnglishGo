package com.englishwebapp.config;

import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class MediaResourceConfig implements WebMvcConfigurer {

    private final AppProperties appProperties;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path uploadRoot = Path.of(appProperties.getUploadDir()).toAbsolutePath().normalize();
        registry.addResourceHandler("/media/**")
                .addResourceLocations(uploadRoot.toUri().toString())
                .setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic());

        /* Static web assets — aggressive long-term cache so repeat
           navigations reuse CSS/JS/fonts from disk. Bump the cache
           version on the asset link (?v=) to invalidate. */
        CacheControl assetCache = CacheControl.maxAge(30, TimeUnit.DAYS)
                .cachePublic()
                .immutable();
        register(registry, "/css/**", "classpath:/static/css/").setCacheControl(assetCache);
        register(registry, "/js/**", "classpath:/static/js/").setCacheControl(assetCache);
        register(registry, "/webjars/**", "classpath:/META-INF/resources/webjars/").setCacheControl(assetCache);
        register(registry, "/favicon.ico", "classpath:/static/").setCacheControl(assetCache);
        register(registry, "/images/**", "classpath:/static/images/").setCacheControl(assetCache);
    }

    private ResourceHandlerRegistration register(ResourceHandlerRegistry registry,
                                                 String pattern,
                                                 String... locations) {
        return registry.addResourceHandler(pattern).addResourceLocations(locations);
    }
}
