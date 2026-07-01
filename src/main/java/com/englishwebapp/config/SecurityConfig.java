package com.englishwebapp.config;

import com.englishwebapp.security.FirebaseAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final FirebaseAuthenticationFilter firebaseAuthenticationFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.ignoringRequestMatchers(
                        "/auth/session",
                                "/auth/logout",
                                "/api/questions/**",
                                "/api/dautoeic/**",
                                "/api/practice/**",
                        "/api/vocab/**",
                        "/admin/**",
                        "/billing/**",
                        "/community/**",
                        "/ai/**",
                        "/teacher/cms/**"))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .exceptionHandling(exceptions -> exceptions
                        .defaultAuthenticationEntryPointFor(
                                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                                new AntPathRequestMatcher("/api/**"))
                        .defaultAuthenticationEntryPointFor(
                                new LoginUrlAuthenticationEntryPoint("/login"),
                                AnyRequestMatcher.INSTANCE))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(new AntPathRequestMatcher("/vocab/**")).permitAll()
                        .requestMatchers(
                                "/",
                                "/listen",
                                "/read",
                                "/lessons",
                                "/lessons/**",
                                "/mock-test",
                                "/tests",
                                "/vocabulary",
                                "/login",
                                "/signup",
                                "/register",
                                "/auth/session",
                                "/auth/status",
                                "/auth/logout",
                                "/css/**",
                                "/js/**",
                                "/images/**",
                                "/media/**",
                                "/favicon.ico")
                        .permitAll()
                        .requestMatchers("/api/questions/**").permitAll()
                        .requestMatchers("/api/dautoeic/**").permitAll()
                        .requestMatchers("/api/vocab/**").permitAll()
                        .requestMatchers("/api/practice/**").authenticated()
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .requestMatchers("/teacher/**").hasAnyRole("TEACHER", "ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(firebaseAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
