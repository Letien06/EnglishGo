package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuestionGroupRepository extends JpaRepository<QuestionGroup, Long> {

    List<QuestionGroup> findByTestIdOrderByIdAsc(Long testId);

    @Query("""
            select g
            from QuestionGroup g
            where (:skillType is null or g.skillType = :skillType)
              and (:part is null or g.part = :part)
              and (:status is null or g.status = :status)
            order by g.id desc
            """)
    Page<QuestionGroup> findForAdmin(
            @Param("skillType") SkillType skillType,
            @Param("part") Integer part,
            @Param("status") ContentStatus status,
            Pageable pageable);

    long countByStatus(ContentStatus status);
}
