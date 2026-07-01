package com.englishwebapp.repository;

import com.englishwebapp.entity.TestQuestion;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestQuestionRepository extends JpaRepository<TestQuestion, Long> {

    @EntityGraph(attributePaths = {"question", "question.group"})
    List<TestQuestion> findByTestIdOrderByDisplayOrderAscIdAsc(Long testId);

    long countByTestId(Long testId);

    void deleteByTestId(Long testId);
}
