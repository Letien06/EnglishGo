package com.englishwebapp.service.firestore;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Component
@RequiredArgsConstructor
public class FirestoreSupport {

    public static final String USERS = "users";

    private final ObjectProvider<Firestore> firestoreProvider;

    public Firestore firestore() {
        return Optional.ofNullable(firestoreProvider.getIfAvailable())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Firestore is not configured"));
    }

    public DocumentReference userDocument(String uid) {
        requireUid(uid);
        return firestore().collection(USERS).document(uid);
    }

    public CollectionReference userCollection(String uid, String collection) {
        if (!StringUtils.hasText(collection)) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Firestore collection is required");
        }
        return userDocument(uid).collection(collection);
    }

    public ResponseStatusException failure(String message, Exception ex) {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message, ex);
    }

    public <T> T await(ApiFuture<T> future) throws InterruptedException, ExecutionException {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw ex;
        }
    }

    private void requireUid(String uid) {
        if (!StringUtils.hasText(uid)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
    }
}
