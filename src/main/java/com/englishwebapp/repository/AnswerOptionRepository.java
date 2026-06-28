package com.englishwebapp.repository;

import com.englishwebapp.entity.AnswerOption;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnswerOptionRepository extends JpaRepository<AnswerOption, Long> {

    List<AnswerOption> findByQuestionIdInOrderByIdAsc(Collection<Long> questionIds);
}
