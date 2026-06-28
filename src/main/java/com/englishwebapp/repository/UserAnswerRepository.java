package com.englishwebapp.repository;

import com.englishwebapp.entity.UserAnswer;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAnswerRepository extends JpaRepository<UserAnswer, Long> {

    @EntityGraph(attributePaths = {"question", "selectedOption"})
    @Query("""
            select userAnswer
            from UserAnswer userAnswer
            join userAnswer.question question
            where userAnswer.attempt.id = :attemptId
            order by question.part asc, question.id asc
            """)
    List<UserAnswer> findByAttemptIdOrderByQuestionPartAscQuestionIdAsc(@Param("attemptId") Long attemptId);
}
