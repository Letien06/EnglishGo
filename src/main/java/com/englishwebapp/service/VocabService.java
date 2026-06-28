package com.englishwebapp.service;

import com.englishwebapp.dto.VocabReviewResponse;
import com.englishwebapp.dto.VocabSetSession;
import com.englishwebapp.dto.VocabWordCard;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserVocabProgress;
import com.englishwebapp.entity.VocabProgressStatus;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.UserVocabProgressRepository;
import com.englishwebapp.repository.VocabSetRepository;
import com.englishwebapp.repository.VocabWordRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class VocabService {

    private static final BigDecimal MIN_EASE_FACTOR = BigDecimal.valueOf(1.30);

    private final VocabSetRepository vocabSetRepository;
    private final VocabWordRepository vocabWordRepository;
    private final UserVocabProgressRepository userVocabProgressRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public Page<VocabSet> findSets(String topic, Pageable pageable) {
        if (StringUtils.hasText(topic)) {
            return vocabSetRepository.findByTopicContainingIgnoreCase(topic, pageable);
        }
        return vocabSetRepository.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public VocabSetSession getSession(Long setId) {
        VocabSet set = vocabSetRepository.findById(setId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        return new VocabSetSession(set, vocabWordRepository.findBySetIdOrderByIdAsc(setId)
                .stream()
                .map(word -> new VocabWordCard(
                        word.getId(),
                        word.getWord(),
                        word.getMeaning(),
                        word.getPhonetic(),
                        word.getExample(),
                        word.getAudioUrl()))
                .toList());
    }

    @Transactional
    public VocabReviewResponse review(Long userId, Long wordId, int quality) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        VocabWord word = vocabWordRepository.findById(wordId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        UserVocabProgress progress = userVocabProgressRepository.findByUserIdAndWordId(userId, wordId)
                .orElseGet(UserVocabProgress::new);
        progress.setUser(user);
        progress.setWord(word);
        applySm2(progress, quality);
        UserVocabProgress saved = userVocabProgressRepository.save(progress);
        return new VocabReviewResponse(
                saved.getStatus(),
                saved.getInterval(),
                saved.getRepetitions(),
                saved.getEaseFactor().doubleValue(),
                saved.getNextReviewAt());
    }

    private void applySm2(UserVocabProgress progress, int quality) {
        BigDecimal easeFactor = progress.getEaseFactor();
        int repetitions = progress.getRepetitions();
        int interval = progress.getInterval();

        if (quality < 3) {
            repetitions = 0;
            interval = 1;
            progress.setStatus(VocabProgressStatus.LEARNING);
        } else {
            repetitions++;
            if (repetitions == 1) {
                interval = 1;
            } else if (repetitions == 2) {
                interval = 6;
            } else {
                interval = BigDecimal.valueOf(interval)
                        .multiply(easeFactor)
                        .setScale(0, RoundingMode.HALF_UP)
                        .intValue();
            }

            BigDecimal qualityFactor = BigDecimal.valueOf(5 - quality);
            easeFactor = easeFactor.add(BigDecimal.valueOf(0.1)
                    .subtract(qualityFactor.multiply(BigDecimal.valueOf(0.08)
                            .add(qualityFactor.multiply(BigDecimal.valueOf(0.02))))));
            if (easeFactor.compareTo(MIN_EASE_FACTOR) < 0) {
                easeFactor = MIN_EASE_FACTOR;
            }
            progress.setStatus(repetitions >= 3 ? VocabProgressStatus.MASTERED : VocabProgressStatus.REVIEW);
        }

        progress.setRepetitions(repetitions);
        progress.setInterval(interval);
        progress.setEaseFactor(easeFactor.setScale(2, RoundingMode.HALF_UP));
        progress.setLastReviewedAt(Instant.now());
        progress.setNextReviewAt(Instant.now().plus(interval, ChronoUnit.DAYS));
    }
}
