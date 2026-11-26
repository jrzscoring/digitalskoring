# Security Specification — Skoring Pencak Silat Tanding

## 1. Data Invariants
1. **Arena Ownership**: An `Arena` document (`/arenas/{arenaId}`) can only be created by an email-verified authenticated user whose `request.auth.uid` matches `ownerId`. `ownerId` and `createdAt` are immutable.
2. **Master Gate on Subcollections**: All `Match`, `MatchEvent`, and `ArenaOperator` documents belong to a valid parent `Arena` (verified via `get()`/`exists()`). Access is strictly limited to the arena `ownerId` or an explicitly registered operator in `/arenas/{arenaId}/operators/{request.auth.uid}`.
3. **Terminal State Locking**: Once a `Match` reaches `status == 'finished'`, scoring/timer mutations are rejected unless explicitly reopened/reset by the arena owner (`ownerId`).
4. **Temporal & Structural Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`. All string fields enforce explicit `.size()` boundaries, and all document IDs match `^[a-zA-Z0-9_\-]+$`.
5. **No Ghost Fields**: Every `create` checks `hasAll` + `hasOnly`, and every `update` uses action-based `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`.
6. **PII Isolation & Immutable Login Audit**: `/users/{userId}` stores email and official credentials restricted strictly to `isOwner(userId) || isAdmin()`, with immutable `uid`, `email`, and `createdAt`. `/users/{userId}/loginLogs/{logId}` is append-only (`allow update, delete: if false`) and bound to `request.auth.uid` and `request.auth.token.email_verified == true`.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Unauthenticated Arena Create**: `{ id: "arena1", name: "Gelanggang A", ... }` without auth -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` creating an arena -> `PERMISSION_DENIED`.
3. **Owner Spoofing on Create**: User A creates arena with `ownerId: "user_B"` -> `PERMISSION_DENIED`.
4. **Ghost Field Injection**: Creating/updating Match with `{ isAdminOverride: true }` -> `PERMISSION_DENIED`.
5. **Oversized ID Poisoning**: Creating match with `id` of 256 chars or illegal chars `../hack` -> `PERMISSION_DENIED`.
6. **Client Timestamp Forgery**: Creating arena with `createdAt: "2020-01-01T00:00:00Z"` instead of server `request.time` -> `PERMISSION_DENIED`.
7. **Cross-Arena Read/List Scraping**: User B queries `list` on `/arenas` without `where('ownerId', '==', userB.uid)` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: Updating `match.ownerId` or `match.arenaId` or `match.createdAt` -> `PERMISSION_DENIED`.
9. **Terminal State Bypass**: Non-owner operator attempts to mutate `blueScore` after `status == 'finished'` -> `PERMISSION_DENIED`.
10. **Value Poisoning**: Updating `blueScore` to a string `"999"` or `status` to `"hacked"` -> `PERMISSION_DENIED`.
11. **Orphan Match Creation**: Creating `/arenas/nonexistent/matches/m1` -> `PERMISSION_DENIED`.
12. **Privilege Escalation & Cross-User PII Read**: Non-owner adds themselves to `/arenas/{arenaId}/operators/{uid}` or reads `/users/{otherUid}` -> `PERMISSION_DENIED`.
