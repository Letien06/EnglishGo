package com.englishwebapp.service;

import com.englishwebapp.entity.Subscription;
import com.englishwebapp.entity.Transaction;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.SubscriptionRepository;
import com.englishwebapp.repository.TransactionRepository;
import com.englishwebapp.repository.UserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class BillingService {

    private static final Map<String, BigDecimal> PLAN_PRICES = Map.of(
            "FREE", BigDecimal.ZERO,
            "PREMIUM_MONTHLY", BigDecimal.valueOf(99000),
            "PREMIUM_YEARLY", BigDecimal.valueOf(899000));

    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TransactionRepository transactionRepository;

    public Map<String, BigDecimal> plans() {
        return PLAN_PRICES;
    }

    @Transactional(readOnly = true)
    public Subscription activeSubscription(Long userId) {
        return subscriptionRepository.findFirstByUserIdAndStatusOrderByStartDateDesc(userId, "ACTIVE").orElse(null);
    }

    @Transactional(readOnly = true)
    public List<Transaction> recentTransactions(Long userId) {
        return transactionRepository.findTop10ByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public Transaction checkout(Long userId, String planId, String provider) {
        if (!PLAN_PRICES.containsKey(planId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown plan");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Transaction transaction = new Transaction();
        transaction.setUser(user);
        transaction.setAmount(PLAN_PRICES.get(planId));
        transaction.setProvider(provider.toUpperCase());
        transaction.setStatus("PAID");
        Transaction savedTransaction = transactionRepository.save(transaction);

        Subscription subscription = new Subscription();
        subscription.setUser(user);
        subscription.setPlanId(planId);
        subscription.setStartDate(LocalDate.now());
        subscription.setEndDate("PREMIUM_YEARLY".equals(planId) ? LocalDate.now().plusYears(1) : LocalDate.now().plusMonths(1));
        subscription.setStatus("ACTIVE");
        subscriptionRepository.save(subscription);
        return savedTransaction;
    }
}
