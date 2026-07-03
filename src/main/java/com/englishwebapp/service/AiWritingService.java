package com.englishwebapp.service;

import com.englishwebapp.entity.AiWritingJob;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class AiWritingService {

    private static final String AI_WRITING_JOBS = "aiWritingJobs";

    private final FirestoreSupport firestoreSupport;

    public List<AiWritingJob> recentJobs(String uid) {
        if (!StringUtils.hasText(uid)) {
            return List.of();
        }
        try {
            return firestoreSupport.await(firestoreSupport.userCollection(uid, AI_WRITING_JOBS).get())
                    .getDocuments()
                    .stream()
                    .map(this::toJob)
                    .sorted(Comparator.comparing(AiWritingJob::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                    .limit(20)
                    .toList();
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load AI writing jobs", ex);
        }
    }

    public AiWritingJob submit(String uid, String prompt, String responseText) {
        if (!StringUtils.hasText(uid)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "User not found");
        }
        AiWritingJob job = new AiWritingJob();
        job.setPrompt(prompt);
        job.setResponseText(responseText);
        job.setStatus("COMPLETED");
        job.setFeedback(buildFeedback(responseText));
        job.setCreatedAt(Instant.now());
        job.setCompletedAt(Instant.now());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("prompt", job.getPrompt());
        data.put("responseText", job.getResponseText());
        data.put("status", job.getStatus());
        data.put("feedback", job.getFeedback());
        data.put("createdAtMillis", job.getCreatedAt().toEpochMilli());
        data.put("completedAtMillis", job.getCompletedAt().toEpochMilli());
        data.put("createdAt", FieldValue.serverTimestamp());
        data.put("updatedAt", FieldValue.serverTimestamp());
        try {
            firestoreSupport.await(firestoreSupport.userCollection(uid, AI_WRITING_JOBS).add(data));
            return job;
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not save AI writing job", ex);
        }
    }

    private AiWritingJob toJob(DocumentSnapshot doc) {
        AiWritingJob job = new AiWritingJob();
        job.setPrompt(stringValue(doc, "prompt"));
        job.setResponseText(stringValue(doc, "responseText"));
        job.setStatus(defaultString(stringValue(doc, "status"), "COMPLETED"));
        job.setFeedback(stringValue(doc, "feedback"));
        job.setCreatedAt(instantValue(doc, "createdAtMillis"));
        job.setCompletedAt(instantValue(doc, "completedAtMillis"));
        return job;
    }

    private String buildFeedback(String responseText) {
        String[] words = responseText.trim().isEmpty() ? new String[0] : responseText.trim().split("\\s+");
        int sentenceCount = responseText.split("[.!?]+").length;
        String fluency = words.length >= 80 ? "Good development" : "Add more supporting detail";
        String structure = sentenceCount >= 4 ? "Clear sentence variety" : "Use more complete sentences";
        return "Words: " + words.length + ". " + fluency + ". " + structure + ".";
    }

    private Instant instantValue(DocumentSnapshot doc, String field) {
        Long value = doc.getLong(field);
        return value == null ? null : Instant.ofEpochMilli(value);
    }

    private String stringValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? null : value.toString();
    }

    private String defaultString(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }
}
