# Yogurtland Coupon MVP

Next.js + TypeScript + Tailwind + Supabase based MVP for:

- game coupon issuance
- staff coupon validation and redeem
- admin coupon dashboard

## Routes

- `/coupon`: game-facing coupon issue demo page
- `/login`: staff/admin portal login
- `/redeem`: staff coupon validate/redeem console
- `/admin`: admin dashboard
- `/r/[code]`: short QR redirect route

## Tech Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Backend: Next.js Route Handlers
- Database: Supabase PostgreSQL
- Validation: zod
- QR generation: qrcode
- Auth: simple password + signed HTTP-only cookie session

## Folder Structure

```text
app/
  admin/page.tsx
  coupon/page.tsx
  login/page.tsx
  redeem/page.tsx
  r/[code]/page.tsx
  api/
    auth/
      login/route.ts
      logout/route.ts
      session/route.ts
    coupons/
      issue/route.ts
      validate/route.ts
      redeem/route.ts
    admin/
      stats/route.ts
      redeem-logs/route.ts
      coupons/route.ts
  components/
    PortalLoginClient.tsx
    CouponIssueClient.tsx
    RedeemConsoleClient.tsx
    AdminDashboardClient.tsx
  lib/
    couponMvp.ts
    couponData.ts
    portalAuth.ts
    portalPage.ts
supabase/
  migrations/
    20260317_coupon_mvp.sql
docs/
  coupon-mvp-seed.sql
  coupon-mvp-architecture.md
```

## Environment Variables

Create `.env.local`.

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_PANEL_TOKEN=your_admin_password
STAFF_PORTAL_PASSWORD=your_staff_password
PORTAL_SESSION_SECRET=long_random_secret
```

## Run Locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/coupon`
- `http://localhost:3000/login`

## Database Migration

Apply the new schema migration in Supabase:

```bash
supabase db push
```

Or run the SQL manually from:

- `supabase/migrations/20260317_coupon_mvp.sql`

## Seed Dummy Data

Run the seed SQL after the migration:

- `docs/coupon-mvp-seed.sql`

This creates:

- sample stores
- sample staff users
- sample coupons in unused / used / expired states

Sample staff seed:

- `storeId=pohang_01`
- `staffId=staff_02`

## API Summary

### `POST /api/coupons/issue`

Request:

```json
{
  "userId": "user_123",
  "score": 92
}
```

Behavior:

- issues coupon when score is `>= 80`
- returns coupon payload + short redeem URL for QR

### `POST /api/coupons/validate`

Request:

```json
{
  "code": "YG7A92K3"
}
```

Behavior:

- staff/admin session required
- returns `unused`, `used`, `expired`, or `invalid`
- writes validation audit log

### `POST /api/coupons/redeem`

Request:

```json
{
  "code": "YG7A92K3",
  "storeId": "pohang_01",
  "staffId": "staff_02",
  "orderNumber": "A1024"
}
```

Behavior:

- staff session required
- re-validates coupon on server
- calls PostgreSQL function `redeem_coupon_atomic`
- stores redeem metadata and audit log
- blocks double-redeem using row lock

### `GET /api/admin/stats`

Returns:

- total issued
- total redeemed
- usage rate
- status counts
- recent logs
- issued / redeemed daily chart series
- store usage counts

### `GET /api/admin/redeem-logs`

Query:

- `page`
- `pageSize`
- `format=csv`

### `GET|POST /api/admin/coupons`

- `GET`: recent coupon list
- `POST`: manual coupon creation from admin dashboard

## Concurrency Strategy

Redeem concurrency is handled in PostgreSQL with `redeem_coupon_atomic(...)`.

- coupon row is selected `FOR UPDATE`
- only one transaction can move `unused -> used`
- duplicate requests return `already_used`
- expired rows are normalized to `expired`
- success/failure logs are written in the same database function

## Authentication

MVP auth model:

- admin: password from `ADMIN_PANEL_TOKEN`
- staff: password from `STAFF_PORTAL_PASSWORD` + active `staff_users` row
- session: signed HTTP-only cookie from `PORTAL_SESSION_SECRET`

Authorization:

- `/redeem` and redeem API: staff only
- `/admin` and admin APIs: admin only

## Deployment

Any Next.js-compatible host works.

Typical flow:

1. Set environment variables on the host.
2. Provision Supabase project and run migration.
3. Run seed SQL only for non-production or staging.
4. Deploy with `npm run build`.

Vercel example:

```bash
npm run build
```

Set the same environment variables in the Vercel project.

## Test Scenarios

1. Go to `/coupon`, enter `user_123` and `92`, issue a coupon, confirm QR and code are shown.
2. Log in at `/login` as staff with `pohang_01 / staff_02`, validate the issued code on `/redeem`.
3. Redeem the coupon once and confirm the page shows redeem time, store ID, staff ID, and optional order number.
4. Validate the same code again and confirm it shows `이미 사용됨`.
5. Validate seeded code `YG3X71P9` and confirm it shows `만료됨`.
6. Validate a random code and confirm it shows `존재하지 않음`.
7. Log in as admin and confirm `/admin` shows totals, status counts, recent logs, charts, store usage, and recent coupons.
8. Download CSV from `/api/admin/redeem-logs?format=csv`.

## Verification

Build verified with:

```bash
npm run build
```
