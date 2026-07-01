package com.englishwebapp.repository;

import com.englishwebapp.entity.AcceptedAnswer;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AcceptedAnswerRepository extends JpaRepository<AcceptedAnswer, Long> {

    List<AcceptedAnswer> findByQuestionIdInOrderByIdAsc(Collection<Long> questionIds);

    List<AcceptedAnswer> findByQuestionIdOrderByIdAsc(Long questionId);

    void deleteByQuestionId(Long questionId);
}
