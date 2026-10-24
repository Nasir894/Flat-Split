-- Flat Split schema. Idempotent: safe to run more than once.
-- Amounts are stored in poisha (1 taka = 100 poisha) as integers to avoid float errors.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text,                       -- null = account restored from backup, PIN must be set again
  color text not null default '#6366f1',
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
-- Names are unique per house: see users_house_name_lower in the "Several houses" section below.
-- PIN recovery: a one-time recovery code (hashed), or a reset approved by another flatmate.
alter table users add column if not exists recovery_hash text;
alter table users add column if not exists reset_approved_by uuid references users(id);
alter table users add column if not exists reset_expires_at timestamptz;
-- Joining needs approval: new members start 'pending' until an existing member approves them.
alter table users add column if not exists status text not null default 'active';
alter table users add column if not exists approved_by uuid references users(id);
alter table users add column if not exists approved_at timestamptz;
do $$ begin
  alter table users add constraint users_status_check check (status in ('pending', 'active'));
exception when duplicate_object then null; end $$;

-- Profile pictures: small (≤256px) images resized on the phone, stored inline.
alter table users add column if not exists avatar bytea;
alter table users add column if not exists avatar_type text;
alter table users add column if not exists avatar_updated_at timestamptz;

-- House-wide settings (e.g. the house code), editable from the app.
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🏷️',
  is_default boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_by uuid references users(id),
  deleted_at timestamptz
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references users(id),
  amount bigint not null check (amount > 0),
  category_id uuid references categories(id),
  description text not null default '',
  spent_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references users(id),
  updated_at timestamptz,
  deleted_by uuid references users(id),
  deleted_at timestamptz,
  version int not null default 1
);
create index if not exists expenses_spent_at on expenses (spent_at desc);

create table if not exists expense_shares (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references users(id),
  amount bigint not null check (amount >= 0),
  primary key (expense_id, user_id)
);
create index if not exists expense_shares_user on expense_shares (user_id);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references users(id),
  to_user_id uuid not null references users(id),
  amount bigint not null check (amount > 0),
  note text not null default '',
  sent_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references users(id),
  updated_at timestamptz,
  deleted_by uuid references users(id),
  deleted_at timestamptz,
  version int not null default 1,
  check (from_user_id <> to_user_id)
);
create index if not exists transfers_sent_at on transfers (sent_at desc);

create table if not exists rice_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  given_at timestamptz not null default now(),
  note text not null default '',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references users(id),
  updated_at timestamptz,
  deleted_by uuid references users(id),
  deleted_at timestamptz,
  version int not null default 1
);
create index if not exists rice_entries_given_at on rice_entries (given_at);

create table if not exists audit_log (
  id bigserial primary key,
  entity text not null,                -- expense | transfer | rice | category | user | backup
  entity_id uuid,
  action text not null,                -- create | update | delete | restore | import
  actor_id uuid,
  summary text not null default '',
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity on audit_log (entity, entity_id);
create index if not exists audit_log_created on audit_log (created_at desc);

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Fingerprint / face sign-in (WebAuthn passkeys). Only public keys are stored; biometrics never leave the phone.
create table if not exists passkeys (
  id text primary key,                 -- credential id (base64url)
  user_id uuid not null references users(id) on delete cascade,
  public_key text not null,            -- COSE public key (base64url)
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user on passkeys (user_id);

-- Failed house-code attempts per client, for rate limiting sign-ups.
create table if not exists auth_failures (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists auth_failures_key on auth_failures (key, at);

-- The audit log is append-only: nobody (including the app) can edit or erase history.
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- Records are never hard-deleted (soft delete via deleted_at). The only exception is a
-- full JSON restore, which sets the transaction-local flag flatsplit.restore = 'on'.
create or replace function block_hard_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('flatsplit.restore', true), '') <> 'on' then
    raise exception '% rows cannot be hard-deleted; use soft delete', tg_table_name;
  end if;
  return old;
end $$;
do $$
declare t text;
begin
  -- expense_shares are rewritten on edit; their previous state lives in the audit log.
  foreach t in array array['expenses','transfers','rice_entries','categories'] loop
    execute format('drop trigger if exists %I_no_delete on %I', t, t);
    execute format('create trigger %I_no_delete before delete on %I for each row execute function block_hard_delete()', t, t);
  end loop;
end $$;

-- Default categories
insert into categories (name, emoji, is_default)
select v.name, v.emoji, true
from (values
  ('Grocery', '🛒'), ('Fast Food', '🍔'), ('Fish & Meat', '🍗'), ('Vegetables', '🥬'),
  ('Utilities', '💡'), ('Internet', '🌐'), ('Gas', '🔥'), ('Household', '🧴'),
  ('Rent', '🏠'), ('Other', '📦')
) as v(name, emoji)
-- Only for a database from before houses existed; new houses get their own defaults when they're made.
where not exists (select 1 from categories where is_default)
  and to_regclass('public.houses') is null and exists (select 1 from users);

-- Transfers need the receiver's OK before they count: pending → approved / declined.
alter table transfers add column if not exists status text not null default 'approved';
alter table transfers add column if not exists responded_by uuid references users(id);
alter table transfers add column if not exists responded_at timestamptz;
do $$ begin
  alter table transfers add constraint transfers_status_check check (status in ('pending', 'approved', 'declined'));
exception when duplicate_object then null; end $$;

-- Group chat: text and emoji only (no files). Members can delete their own messages (soft).
create table if not exists chat_messages (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_created on chat_messages (id desc);

-- Chat reactions: one emoji per member per message (tap again to remove, another emoji to change).
alter table chat_messages add column if not exists updated_at timestamptz not null default now();
create index if not exists chat_messages_updated on chat_messages (updated_at);
create table if not exists chat_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- "… is typing": last keystroke time per member (ephemeral).
create table if not exists chat_typing (
  user_id uuid primary key references users(id) on delete cascade,
  at timestamptz not null default now()
);

-- Custom "turn" trackers (cyclic duties). Rice is the built-in first one; members can add more
-- (gas cylinder, trash, cleaning…). member_ids null = everyone in the house takes part.
create table if not exists trackers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🔁',
  member_ids uuid[],
  is_default boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_by uuid references users(id),
  deleted_at timestamptz
);
insert into trackers (id, name, emoji, is_default, created_at)
select '00000000-0000-4000-8000-000000000001'::uuid, 'Rice', '🍚', true, '2000-01-01'::timestamptz
where to_regclass('public.houses') is null and exists (select 1 from users)
on conflict (id) do nothing;
alter table rice_entries add column if not exists tracker_id uuid not null
  default '00000000-0000-4000-8000-000000000001' references trackers(id);
create index if not exists rice_entries_tracker on rice_entries (tracker_id, given_at);

-- Roles: home sharers ('member', the admins who live in the flat) and tour-only 'guest's.
alter table users add column if not exists role text not null default 'member';
do $$ begin
  alter table users add constraint users_role_check check (role in ('member', 'guest'));
exception when duplicate_object then null; end $$;

-- Tours: planned → active (started manually) → closed (archive). Separate from the home fund
-- until closed; on close guests settle with one home sharer each and the rest joins the home fund.
create table if not exists tours (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🧳',
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  start_date date,
  end_date date,
  notes text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  started_by uuid references users(id),
  closed_at timestamptz,
  closed_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);
create table if not exists tour_participants (
  tour_id uuid not null references tours(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (tour_id, user_id)
);
-- Planner: budget lines to compare with actual spending.
create table if not exists tour_plan_items (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  label text not null,
  category_id uuid references categories(id),
  amount bigint not null check (amount >= 0),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
alter table expenses add column if not exists tour_id uuid references tours(id);
create index if not exists expenses_tour on expenses (tour_id);
alter table transfers add column if not exists tour_id uuid references tours(id);
alter table transfers add column if not exists settlement boolean not null default false;
create index if not exists transfers_tour on transfers (tour_id);

-- How each person's share was set: 'equal', 'extra' (± amount on top of the equal part) or
-- 'exact' (their own total). `adjust` holds the ± or exact amount in poisha.
alter table expense_shares add column if not exists mode text not null default 'equal';
alter table expense_shares add column if not exists adjust bigint not null default 0;
do $$ begin
  alter table expense_shares add constraint expense_shares_mode_check check (mode in ('equal', 'extra', 'exact'));
exception when duplicate_object then null; end $$;

-- ---------- Several houses ----------
-- Anyone can start a house. Each house has its own members, money, chat, turns, tours and settings.
-- Row-level security keeps houses apart: for every request the app switches to the flat_app role
-- and sets app.house_id, so a query can only see and write its own house's rows. With no house
-- set, flat_app sees nothing (fails closed). Sign-in lookups that must search every house run as
-- the owner role instead.
create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz
);
create unique index if not exists houses_code_lower on houses (lower(code));

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'flat_app') then create role flat_app nologin; end if;
end $$;
grant flat_app to current_user;
grant usage on schema public to flat_app;
grant select, insert, update, delete on all tables in schema public to flat_app;
grant usage, select on all sequences in schema public to flat_app;
alter default privileges in schema public grant select, insert, update, delete on tables to flat_app;
alter default privileges in schema public grant usage, select on sequences to flat_app;

do $$
declare
  t text;
  first_house uuid;
  tables text[] := array['users', 'settings', 'categories', 'expenses', 'expense_shares', 'transfers', 'rice_entries',
    'audit_log', 'chat_messages', 'chat_reactions', 'chat_typing', 'trackers', 'tours', 'tour_participants', 'tour_plan_items'];
begin
  -- Everything from before houses existed becomes the first house, keeping its house code.
  if not exists (select 1 from houses) and exists (select 1 from users) then
    insert into houses (code, created_at)
    values (coalesce((select value from settings where key = 'house_code'), 'house-' || substr(md5(random()::text), 1, 8)),
            coalesce((select min(created_at) from users), now()))
    returning id into first_house;
  end if;
  foreach t in array tables loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'house_id') then
      execute format('alter table %I add column house_id uuid references houses(id) on delete cascade', t);
      if first_house is not null then
        execute format('alter table %I disable trigger user', t); -- the audit log is append-only
        execute format('update %I set house_id = %L', t, first_house);
        execute format('alter table %I enable trigger user', t);
      end if;
      execute format('alter table %I alter column house_id set not null', t);
      execute format($f$alter table %I alter column house_id set default nullif(current_setting('app.house_id', true), '')::uuid$f$, t);
      execute format('create index if not exists %I on %I (house_id)', t || '_house', t);
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists house_isolation on %I', t);
    execute format($f$create policy house_isolation on %I
      using (house_id = nullif(current_setting('app.house_id', true), '')::uuid)
      with check (house_id = nullif(current_setting('app.house_id', true), '')::uuid)$f$, t);
  end loop;
end $$;

-- A house can only see itself (its code).
alter table houses enable row level security;
drop policy if exists house_self on houses;
create policy house_self on houses using (id = nullif(current_setting('app.house_id', true), '')::uuid);

-- The house code now lives on the house.
delete from settings where key = 'house_code';

-- Settings and member names are per house.
do $$ begin
  if (select count(*) from information_schema.key_column_usage
      where table_schema = 'public' and table_name = 'settings' and constraint_name = 'settings_pkey') = 1 then
    alter table settings drop constraint settings_pkey;
    alter table settings add primary key (house_id, key);
  end if;
end $$;
drop index if exists users_name_lower;
create unique index if not exists users_house_name_lower on users (house_id, lower(name));

-- Each house has its own Rice tracker, so new turns always name their tracker.
alter table rice_entries alter column tracker_id drop default;

-- ---------- Phone app ----------
-- Each signed-in phone running the Android app: where to send its push notifications, and the hash
-- of its device key. The key only allows the few things notification buttons do (confirm a payment,
-- answer a join request, reply in chat); signing out on the phone deletes the row.
create table if not exists app_devices (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null default nullif(current_setting('app.house_id', true), '')::uuid references houses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  push_token text,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists app_devices_push_token on app_devices (push_token) where push_token is not null;
create index if not exists app_devices_user on app_devices (user_id);
alter table app_devices enable row level security;
drop policy if exists house_isolation on app_devices;
create policy house_isolation on app_devices
  using (house_id = nullif(current_setting('app.house_id', true), '')::uuid)
  with check (house_id = nullif(current_setting('app.house_id', true), '')::uuid);
grant select, insert, update, delete on app_devices to flat_app;