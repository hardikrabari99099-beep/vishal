# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. No PII (`email`, `phone`, `kycStatus`) is stored on `/users/{userId}` — PII is isolated to `/users/{userId}/private/info`, readable only by `isOwner(userId)` or `isAdmin()`.
2. A non-admin user can NEVER create or elevate a `/users/{userId}` profile with `role == 'admin'`, nor mutate `uid`, `createdAt`, or `role` after creation.
3. Public reads on `/blogs/{blogId}` and `/certificates/{certId}` are strictly filtered so unpublished drafts (`published == false`) and hidden certificates (`visible == false`) are denied to non-admins.
4. Every `create` and `update` requires `request.auth != null && request.auth.token.email_verified == true` and enforces `request.time` server timestamps (`createdAt` / `updatedAt`).
5. No user can create, update, or delete `/trader_accounts/{accountId}`, `/site_config/{configId}`, `/plans/{planId}`, `/blogs/{blogId}`, or `/certificates/{certId}` without `isAdmin()`.
6. List queries on `/users/{userId}` and `/trader_accounts/{accountId}` validate `resource.data.uid == request.auth.uid || isAdmin()` at the rule layer (no blanket signed-in list scraping, no `get()` inside `allow list`).
7. Full cloud mirror documents in `/admin_records/{recordId}` are exclusively readable and writable by verified admins (`isAdmin()` / `isBootstrappedAdmin()`), and never store SMTP passwords, hashes, or secret API keys.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Privilege Escalation on Create**: Trader writes `/users/{uid}` with `role: "admin"` -> Denied (`data.role == 'user'`).
2. **Role Tampering on Update**: Trader updates `/users/{uid}` changing `role` from `'user'` to `'admin'` -> Denied (`affectedKeys().hasOnly(['displayName', 'updatedAt'])`).
3. **Ghost / Shadow Field Injection**: Trader writes `/users/{uid}` adding extra key `isVerified: true` -> Denied (`keys().hasOnly(...)`).
4. **UID Spoofing**: User A (`uidA`) creates `/users/{uidA}` with `uid: "uidB"` -> Denied (`data.uid == request.auth.uid`).
5. **PII Cross-User Read**: Signed-in User B tries `get(/users/uidA/private/info)` -> Denied (`isOwner(uidA) || isAdmin()`).
6. **Blanket User List Scraping**: Non-admin signed-in user runs `list /users` without `where('uid', '==', auth.uid)` -> Denied (`resource.data.uid == request.auth.uid`).
7. **Admin Spoof via Unverified Email**: Unverified Firebase token with email `growthloopp@gmail.com` (`email_verified == false`) attempts write to `/site_config/public` -> Denied (`email_verified == true`).
8. **Unauthenticated Settings Write**: Unauthenticated caller writes `/site_config/public` -> Denied (`isAdmin()`).
9. **Path ID Poisoning**: Caller targets `/plans/<150-char junk id>` or invalid characters `foo/bar` -> Denied (`isValidId()`).
10. **Payload Size Poisoning**: Admin/user submits 50KB `displayName` or >15 `features` array in `/plans/{id}` -> Denied (`size()` bounds).
11. **Timestamp Forgery**: Caller writes `createdAt` or `updatedAt` != `request.time` -> Denied (`incoming().createdAt == request.time`).
12. **Draft Blog Exposure**: Non-admin reads `/blogs/{draftId}` where `published == false` -> Denied (`resource.data.published == true || isAdmin()`).
