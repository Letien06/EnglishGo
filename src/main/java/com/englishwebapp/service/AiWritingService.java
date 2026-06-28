package com.englishwebapp.service;

import com.englishwebapp.entity.AiWritingJob;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.AiWritingJobRepository;
import com.englishwebapp.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AiWritingService {

    private final AiWritingJobRepository aiWritingJobRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<AiWritingJob> recentJobs(Long userId) {
        return aiWritingJobRepository.findTop20ByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public AiWritingJob submit(Long userId, String prompt, String responseText) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        AiWritingJob job = new AiWritingJob();
        job.setUser(user);
        job.setPrompt(prompt);
        job.setResponseText(responseText);
        job.setStatus("COMPLETED");
        job.setFeedback(buildFeedback(responseText));
        job.setCompletedAt(Instant.now());
        return aiWritingJobRepository.save(job);
    }

    private String buildFeedback(String responseText) {
        String[] words = responseText.trim().isEmpty() ? new String[0] : responseText.trim().split("\\s+");
        int sentenceCount = responseText.split("[.!?]+").length;
        String fluency = words.length >= 80 ? "Good development" : "Add more supporting detail";
        String structure = sentenceCount >= 4 ? "Clear sentence variety" : "Use more complete sentences";
        return "Words: " + words.length + ". " + fluency + ". " + structure + ".";
    }
}
