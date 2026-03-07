# Coupon MVP Rollout

## 1. Database migration

Apply the new migration after the existing `entries` and rate-limit migrations.

Recommended order:

1. `supabase/migrations/20260301_create_entries.sql`
2. `supabase/migrations/20260302_add_entries_profile_columns.sql`
3. `supabase/migrations/20260303_entries_nickname_key_unique.sql`
4. `supabase/migrations/20260305_add_nickname_change_logs.sql`
5. `supabase/migrations/20260305_enable_rls_sensitive_tables.sql`
6. `supabase/migrations/20260307_create_wallet_coupons.sql`

The new migration adds:

- `coupon_reward_evaluations`
- `wallet_coupons`
- indexes for wallet lookups
- RLS enablement and anon/authenticated revokes

## 2. Environment check

Confirm these environment variables are set in the deployed app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENTRY_SESSION_SECRET`

Recommended for correct QR/redeem URLs:

- `NEXT_PUBLIC_APP_URL=https://your-domain.example`

## 3. Manual test checklist

### Login/session

- Log in with an existing game account.
- Confirm the home screen shows `My Wallet`.
- Open `/wallet` and confirm the page loads without a new login flow.

### Coupon issuing

- Finish a game with score `99`.
  Expected: no coupon issued.
- Finish a game with score `100`.
  Expected: `Free Topping` issued.
- Finish a game with score `180`.
  Expected: `$1 Off` issued.
- Finish a game with score `250`.
  Expected: `BOGO` issued.
- For each successful issue:
  Expected: wallet toast appears and `/wallet` shows the new active coupon.

### Highest eligible reward only

- Finish a game with score `250+`.
  Expected: only `BOGO` is issued, not lower-tier coupons.

### One coupon per game session

- Retry the same `/api/coupons/issue` payload twice for one completed game session.
  Expected: the second request does not create another coupon.

### Wallet behavior

- Each active coupon should show:
  - title
  - description
  - expiration date
  - QR code
- Scan or open the QR target.
  Expected: it opens `/redeem/[token]`.

### Redeem states

- Open a valid active coupon.
  Expected: status shows `Valid`.
- Click `Redeem Coupon`.
  Expected: coupon is redeemed successfully.
- Refresh the same redeem page.
  Expected: status shows `Already Redeemed`.
- Refresh `/wallet`.
  Expected: redeemed coupon no longer appears in active coupons.
- Change one character in the token URL.
  Expected: status shows `Invalid`.
- Force one coupon `expires_at` into the past in DB and open redeem page.
  Expected: status shows `Expired`.

## 4. MVP notes

- Coupon issuing currently evaluates completed game scores on the server.
- Coupon storage is tied to the existing entry session user.
- Staff redeem is intentionally lightweight and does not require POS integration.
- Wallet only shows active, unexpired, unredeemed coupons.
