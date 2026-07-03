package com.englishwebapp.service;

import com.englishwebapp.entity.Subscription;
import com.englishwebapp.entity.Transaction;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.FieldValue;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class BillingService {

    private static final String SUBSCRIPTIONS = "subscriptions";
    private static final String TRANSACTIONS = "transactions";
    private static final Map<String, BigDecimal> PLAN_PRICES = Map.of(
            "FREE", BigDecimal.ZERO,
            "PREMIUM_MONTHLY", BigDecimal.valueOf(99000),
            "PREMIUM_YEARLY", BigDecimal.valueOf(899000));

    private final FirestoreSupport firestoreSupport;

    public Map<String, BigDecimal> plans() {
        return PLAN_PRICES;
    }

    public Subscription activeSubscription(String uid) {
        if (!StringUtils.hasText(uid)) {
            return null;
        }
        try {
            return firestoreSupport.await(firestoreSupport.userCollection(uid, SUBSCRIPTIONS).get())
                    .getDocuments()
                    .stream()
                    .filter(doc -> "ACTIVE".equalsIgnoreCase(stringValue(doc, "status")))
                    .map(doc -> {
                        Subscription subscription = new Subscription();
                        subscription.setPlanId(stringValue(doc, "planId"));
                        subscription.setStatus(stringValue(doc, "status"));
                        subscription.setStartDate(localDateValue(doc, "startDate"));
                        subscription.setEndDate(localDateValue(doc, "endDate"));
                        return subscription;
                    })
                    .max(Comparator.comparing(Subscription::getStartDate, Comparator.nullsLast(Comparator.naturalOrder())))
                    .orElse(null);
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load subscription", ex);
        }
    }

    public List<Transaction> recentTransactions(String uid) {
        if (!StringUtils.hasText(uid)) {
            return List.of();
        }
        try {
            return firestoreSupport.await(firestoreSupport.userCollection(uid, TRANSACTIONS).get())
                    .getDocuments()
                    .stream()
                    .map(doc -> {
                        Transaction transaction = new Transaction();
                        transaction.setAmount(decimalValue(doc.get("amount")));
                        transaction.setProvider(stringValue(doc, "provider"));
                        transaction.setStatus(stringValue(doc, "status"));
                        return transaction;
                    })
                    .limit(10)
                    .toList();
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load transactions", ex);
        }
    }

    public Transaction checkout(String uid, String planId, String provider) {
        if (!StringUtils.hasText(uid)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        if (!PLAN_PRICES.containsKey(planId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown plan");
        }
        LocalDate start = LocalDate.now();
        LocalDate end = "PREMIUM_YEARLY".equals(planId) ? start.plusYears(1) : start.plusMonths(1);
        Transaction transaction = new Transaction();
        transaction.setAmount(PLAN_PRICES.get(planId));
        transaction.setProvider(provider.toUpperCase());
        transaction.setStatus("PAID");

        Map<String, Object> transactionData = new LinkedHashMap<>();
        transactionData.put("amount", transaction.getAmount());
        transactionData.put("provider", transaction.getProvider());
        transactionData.put("status", transaction.getStatus());
        transactionData.put("createdAt", FieldValue.serverTimestamp());

        Map<String, Object> subscriptionData = new LinkedHashMap<>();
        subscriptionData.put("planId", planId);
        subscriptionData.put("startDate", start.toString());
        subscriptionData.put("endDate", end.toString());
        subscriptionData.put("status", "ACTIVE");
        subscriptionData.put("updatedAt", FieldValue.serverTimestamp());
        try {
            firestoreSupport.await(firestoreSupport.userCollection(uid, TRANSACTIONS).add(transactionData));
            firestoreSupport.await(firestoreSupport.userCollection(uid, SUBSCRIPTIONS)
                    .document("current")
                    .set(subscriptionData));
            return transaction;
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not save checkout", ex);
        }
    }

    private String stringValue(com.google.cloud.firestore.DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? null : value.toString();
    }

    private BigDecimal decimalValue(Object value) {
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return new BigDecimal(text);
        }
        return BigDecimal.ZERO;
    }

    private LocalDate localDateValue(com.google.cloud.firestore.DocumentSnapshot doc, String field) {
        String value = stringValue(doc, field);
        return StringUtils.hasText(value) ? LocalDate.parse(value) : null;
    }
}
