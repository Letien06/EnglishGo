package com.englishwebapp.repository;

import com.englishwebapp.entity.QuestionGroup;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionGroupRepository extends JpaRepository<QuestionGroup, Long> {

    List<QuestionGroup> findByTestIdOrderByIdAsc(Long testId);
}
