# Kabadiwala Connect — Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Users can only read/write their own `/users/{userId}` document (`request.auth.uid == userId`) or admins (`isAdmin()`). Phone numbers and UPI IDs are never publicly readable.
2. **Role Escalation Prevention**: Users cannot assign or mutate `role: 'ADMIN'` or `verificationStatus: 'APPROVED'` via client SDK writes.
3. **Path Variable Hardening**: Every single-document ID (`userId`, `lotId`, `bookingId`, `receiptId`, `disputeId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters.
4. **Immutable Audit & Terminal States**: `Lots` and `Bookings` in `COMPLETED`, `CANCELLED`, `DECLINED`, or `EXPIRED` states cannot be mutated by non-admin clients. `Receipts` and `LedgerEntries` are append-only/immutable for non-admins.
5. **PII-Free Public Receipts**: `/receipts/{receiptId}` contains verified weighbridge details without collector or recycler phone numbers.

## 2. Adversarial "Dirty Dozen" Payloads Blocked by Rules
1. Unauthenticated write to `/lots/lot-1` -> `PERMISSION_DENIED`
2. Spoofed `collectorId` on `/lots` creation -> `PERMISSION_DENIED`
3. Self-promotion to `role: "ADMIN"` on `/users/{uid}` -> `PERMISSION_DENIED`
4. Shadow/ghost field injection (`extraAdminFlag: true`) on `/lots/{lotId}` -> `PERMISSION_DENIED`
5. Oversized `areaLabel` (>120 chars) or `notes` (>500 chars) -> `PERMISSION_DENIED`
6. Invalid path ID (`../etc/passwd` or 1.5KB junk) -> `PERMISSION_DENIED`
7. Blanket `list` scraping of `/users` by non-admin -> `PERMISSION_DENIED`
8. Unverified email spoof trying admin email -> `PERMISSION_DENIED` (`email_verified == true` enforced)
9. Mutating a `COMPLETED` booking by collector -> `PERMISSION_DENIED`
10. Collector directly writing `/ledger_entries/{id}` -> `PERMISSION_DENIED`
11. Unauthenticated read of `/disputes/{id}` -> `PERMISSION_DENIED`
12. Modifying immutable `createdAt` or `collectorId` on `/lots/{id}` update -> `PERMISSION_DENIED`
