create table if not exists game_sessions (
  id bigserial primary key,
  session_id uuid not null,
  entry_id bigint references entries(id) on delete set null,
  nickname_key text,
  mode text not null default 'free' check (mode in ('free', 'mission', 'timeAttack')),
  score integer not null default 0,
  play_time_sec integer,
  completed boolean not null default true,
  coupon_issued boolean not null default false,
  coupon_reward_type text,
  created_at timestamptz not null default now()
);

create index if not exists game_sessions_created_at_idx on game_sessions (created_at desc);
create index if not exists game_sessions_nickname_key_idx on game_sessions (nickname_key);
create index if not exists game_sessions_mode_idx on game_sessions (mode);
create index if not exists game_sessions_session_id_idx on game_sessions (session_id);
