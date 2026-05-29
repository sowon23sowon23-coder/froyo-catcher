alter table game_sessions
  add column if not exists coupon_upgraded boolean not null default false;

create index if not exists game_sessions_coupon_upgraded_idx
  on game_sessions (coupon_upgraded);
