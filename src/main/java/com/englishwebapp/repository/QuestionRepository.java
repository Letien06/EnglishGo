package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SkillType;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    List<Question> findByTestIdOrderByPartAscIdAsc(Long testId);

    List<Question> findByTestIdAndStatusOrderByPartAscIdAsc(Long testId, ContentStatus status);

    Page<Question> findByStatus(ContentStatus status, Pageable pageable);

    long countBySkillType(SkillType skillType);

    long countBySkillTypeAndStatus(SkillType skillType, ContentStatus status);

    long countByGroupId(Long groupId);

    @Query(
            value = """
                    select q
                    from Question q
                    left join fetch q.group g
                    where (:skillType is null or q.skillType = :skillType)
                      and (:part is null or q.part = :part)
                      and (:status is null or q.status = :status)
                      and (:difficultyLevel is null or q.difficultyLevel = :difficultyLevel)
                    order by q.id desc
                    """,
            countQuery = """
                    select count(q)
                    from Question q
                    where (:skillType is null or q.skillType = :skillType)
                      and (:part is null or q.part = :part)
                      and (:status is null or q.status = :status)
                      and (:difficultyLevel is null or q.difficultyLevel = :difficultyLevel)
                    """)
    Page<Question> findForQuestionBank(
            @Param("skillType") SkillType skillType,
            @Param("part") Integer part,
            @Param("status") ContentStatus status,
            @Param("difficultyLevel") Integer difficultyLevel,
            Pageable pageable);

    @Query(
            value = """
                    select q
                    from Question q
                    left join fetch q.group g
                    where q.part in :parts
                      and q.status = :questionStatus
                      and q.skillType = :skillType
                    order by q.id desc
                    """,
            countQuery = """
                    select count(q)
                    from Question q
                    where q.part in :parts
                      and q.status = :questionStatus
                      and q.skillType = :skillType
                    """)
    Page<Question> findPublishedLearningQuestions(
            @Param("parts") List<Integer> parts,
            @Param("skillType") SkillType skillType,
            @Param("questionStatus") ContentStatus questionStatus,
            Pageable pageable);

    long countByStatus(ContentStatus status);
}
