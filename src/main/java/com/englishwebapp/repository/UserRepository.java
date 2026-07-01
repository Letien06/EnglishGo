package com.englishwebapp.repository;

import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByFirebaseUid(String firebaseUid);

    Optional<User> findByEmail(String email);

    long countByRole(UserRole role);
}
