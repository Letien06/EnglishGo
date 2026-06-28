package com.englishwebapp.repository;

import com.englishwebapp.entity.Comment;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    @EntityGraph(attributePaths = {"user"})
    List<Comment> findTop30ByTargetTypeAndTargetIdAndDeletedAtIsNullOrderByCreatedAtDesc(String targetType, Long targetId);
}
