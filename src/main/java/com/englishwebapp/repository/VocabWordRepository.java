package com.englishwebapp.repository;

import com.englishwebapp.entity.VocabWord;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VocabWordRepository extends JpaRepository<VocabWord, Long> {

    List<VocabWord> findBySetIdOrderByIdAsc(Long setId);
}
