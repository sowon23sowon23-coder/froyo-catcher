# Coupon MVP Architecture

## 1. System Architecture Proposal

### High-level flow

1. Game sends score to `POST /api/coupons/issue`.
2. Server validates score threshold and creates a one-time coupon in PostgreSQL.
3. Server returns coupon metadata plus short redeem URL for QR generation.
4. Staff scans QR or enters code on `/redeem`.
5. Staff validates code through `POST /api/coupons/validate`.
6. Staff redeems through `POST /api/coupons/redeem`.
7. PostgreSQL function atomically transitions coupon from `unused` to `used`.
8. Admin monitors issuance/redeem metrics on `/admin`.

### Runtime components

- Next.js App Router
- Route Handlers for issuance, validation, redeem, auth, admin stats
- Supabase Postgres for coupon state and audit logs
- Signed cookie session for staff/admin portal access

### Why this fits MVP

- no Aloha POS API dependency
- deployable as one web app
- staff flow is fast and tablet-friendly
- admin reporting comes from the same source of truth
- concurrency is handled in DB, not in UI

## 2. DB Schema

### `coupons`

- `id`
- `code` unique
- `user_id` nullable
- `coupon_name`
- `reward_type`
- `discount_amount`
- `status` = `unused | used | expired`
- `issued_at`
- `expires_at`
- `redeemed_at`
- `redeemed_store_id`
- `redeemed_staff_id`
- `order_number`
- `created_at`
- `updated_at`

### `redeem_logs`

- `id`
- `coupon_id`
- `code`
- `action_type` = `validate | redeem_success | redeem_fail`
- `reason`
- `store_id`
- `staff_id`
- `order_number`
- `created_at`

### `stores`

- `id`
- `name`
- `active`
- `created_at`
- `updated_at`

### `staff_users`

- `id`
- `name`
- `store_id`
- `role`
- `active`
- `created_at`
- `updated_at`

## 3. API Spec

### `POST /api/coupons/issue`

- input: `userId`, `score`
- rule: issue only when score >= 80
- output: coupon data, `qrPayload`, `redeemUrl`

### `POST /api/coupons/validate`

- input: `code`
- auth: staff or admin
- output:
  - `valid`
  - `status`
  - `reason`
  - `coupon`

### `POST /api/coupons/redeem`

- input: `code`, `storeId`, `staffId`, `orderNumber?`
- auth: staff
- behavior:
  - verify session/store/staff match
  - call `redeem_coupon_atomic`
  - persist redeemed metadata
  - return clear failure reason on duplicate/expired/invalid

### `GET /api/admin/stats`

- auth: admin
- output:
  - total issued
  - total redeemed
  - usage rate
  - status counts
  - recent logs
  - daily chart data
  - per-store usage aggregation

### `GET /api/admin/redeem-logs`

- auth: admin
- query: `page`, `pageSize`, `format=csv`
- output: paginated JSON or CSV download

### `GET|POST /api/admin/coupons`

- auth: admin
- `GET`: recent coupon list
- `POST`: manual coupon issue

## 4. Concurrency and State Transition

### State rules

- `unused`: redeemable
- `used`: already redeemed
- `expired`: non-redeemable
- missing row: `invalid`

### Atomic redeem

Implemented in SQL function:

- `public.redeem_coupon_atomic(code, store_id, staff_id, order_number)`

This function:

- locks target coupon row with `FOR UPDATE`
- rejects invalid / used / expired states
- updates successful redeem in one transaction
- inserts success/failure redeem log

This prevents two staff devices from redeeming the same coupon at the same time.

## 5. Frontend

### `/coupon`

- issue demo for game-side testing
- shows coupon name, code, expiration, QR

### `/redeem`

- large code input
- Enter-to-validate for keyboard wedge scanners
- color-first status display
- large redeem button
- optional order number
- toast feedback

### `/admin`

- stat cards
- simple daily charts
- recent logs
- status counts
- store usage
- manual coupon creation
- CSV export
