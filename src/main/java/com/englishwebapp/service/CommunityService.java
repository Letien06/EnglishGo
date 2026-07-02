package com.englishwebapp.service;

import com.englishwebapp.entity.Comment;
import com.englishwebapp.entity.LeaderboardEntry;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.CommentRepository;
import com.englishwebapp.repository.LeaderboardEntryRepository;
import com.englishwebapp.repository.UserRepository;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class CommunityService {

    private static final String ALL_TIME = "ALL_TIME";
    private static final String WEEKLY = "WEEKLY";

    private final CommentRepository commentRepository;
    private final LeaderboardEntryRepository leaderboardEntryRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<Comment> comments(String targetType, Long targetId) {
        return commentRepository.findTop30ByTargetTypeAndTargetIdAndDeletedAtIsNullOrderByCreatedAtDesc(targetType, targetId);
    }

    @Transactional
    public Comment addComment(Long userId, String targetType, Long targetId, String content) {
        if (!StringUtils.hasText(content)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Comment content is required");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        Comment comment = new Comment();
        comment.setUser(user);
        comment.setTargetType(targetType);
        comment.setTargetId(targetId);
        comment.setContent(content.trim());
        return commentRepository.save(comment);
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> leaderboard() {
        return leaderboardEntryRepository.findTop20ByPeriodOrderByScoreDesc(ALL_TIME);
    }

    @Transactional(readOnly = true)
    public List<LeaderboardEntry> leaderboard(String period) {
        return leaderboardEntryRepository.findTop20ByPeriodOrderByScoreDesc(normalizePeriod(period));
    }

    @Transactional
    public void addScore(User user, BigDecimal score) {
        LeaderboardEntry entry = leaderboardEntryRepository.findByUserIdAndPeriod(user.getId(), ALL_TIME)
                .orElseGet(LeaderboardEntry::new);
        entry.setUser(user);
        entry.setPeriod(ALL_TIME);
        entry.setScore((entry.getScore() == null ? BigDecimal.ZERO : entry.getScore()).add(score));
        leaderboardEntryRepository.save(entry);
        refreshRanks();
    }

    private void refreshRanks() {
        List<LeaderboardEntry> entries = leaderboardEntryRepository.findTop20ByPeriodOrderByScoreDesc(ALL_TIME)
                .stream()
                .sorted(Comparator.comparing(LeaderboardEntry::getScore).reversed())
                .toList();
        for (int index = 0; index < entries.size(); index++) {
            entries.get(index).setRankPosition(index + 1);
        }
        leaderboardEntryRepository.saveAll(entries);
    }

    public String normalizePeriod(String period) {
        if ("weekly".equalsIgnoreCase(period) || WEEKLY.equalsIgnoreCase(period)) {
            return WEEKLY;
        }
        return ALL_TIME;
    }
}
