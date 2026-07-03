package com.englishwebapp.security;

import com.englishwebapp.entity.UserRole;
import java.io.Serializable;

public record AppUserPrincipal(
        @Deprecated(forRemoval = true)
        Long id,
        String firebaseUid,
        String email,
        String displayName,
        UserRole role) implements Serializable {

    public String uid() {
        return firebaseUid;
    }
}
