# SQL to Firestore Migration Checklist

Use this only if old production SQL data must be retained. If old SQL data is disposable, skip this checklist.

## Preconditions

- Freeze writes to the SQL-backed deployment.
- Export SQL backup before any migration run.
- Confirm Firebase project and service account point to the target environment.
- Run the app from this branch and verify `mvn clean test` passes.

## Id Mapping

- Users must map to Firebase Auth UID.
- Legacy numeric ids can be stored only as `legacyId` for one-time reconciliation.
- New user-owned documents must be written under `users/{uid}/...`.

## Migration Order

1. `users` -> `users/{uid}`.
2. listening progress, notes, favorites, vocab basket -> `users/{uid}/listening*`.
3. reading progress, notes, favorites, vocab basket -> `users/{uid}/reading*`.
4. vocab progress -> `users/{uid}/vocabProgress/{wordId}`.
5. practice drafts and attempts -> `users/{uid}/practiceDrafts` and `users/{uid}/practiceAttempts`.
6. community, billing, AI writing, and media metadata only if the old data is still useful.

## Write Rules

- Use deterministic document ids where possible.
- Use Firestore batch writes with at most 500 writes per batch.
- Make the script idempotent; reruns must update the same documents, not duplicate them.
- Log source row count, target write count, skipped rows, and failures per table.

## Verification

- Compare source and target counts per migrated collection.
- Spot-check at least five real users across profile, progress, vocab, and practice history.
- Boot production config without any `DATABASE_*` environment variables.
- Run grep gates:
  - `JpaRepository`
  - `jakarta.persistence`
  - `spring.jpa`
  - `spring.flyway`
  - `principal.id()`
  - `Long userId`
