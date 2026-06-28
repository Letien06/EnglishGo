package com.englishwebapp.repository;

import com.englishwebapp.entity.Transaction;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    List<Transaction> findTop10ByUserIdOrderByCreatedAtDesc(Long userId);
}
