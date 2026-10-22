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
create unique index if not exists users_name_lower on users (lower(name));
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
where not exists (select 1 from categories where is_default);

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