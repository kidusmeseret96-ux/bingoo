-- Zemen Bingo — Supabase Database Schema & Admin RPC Functions
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run anytime (idempotent).

create extension if not exists pgcrypto;

-- 1. Global App & Bot Settings (single row id = 1)
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  admin_pin text not null default '1234',
  admin_group_id text not null default '',
  extra_group_ids text not null default '',
  deposit_intro_text text not null default 'Choose a bank or wallet below to deposit:',
  withdraw_intro_text text not null default 'Choose your withdrawal bank or wallet below:',
  withdraw_prompt_text text not null default 'Send your full name, account number, and the Birr amount you want to withdraw:',
  commission_percent int not null default 20,
  call_interval_ms int not null default 3500,
  referral_signup_bonus numeric not null default 20,
  referral_deposit_50_bonus numeric not null default 20,
  referral_deposit_bonus numeric not null default 20,
  custom_recent_winners jsonb,
  custom_leaderboard jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings add column if not exists extra_group_ids text not null default '';
alter table public.app_settings add column if not exists referral_signup_bonus numeric not null default 20;
alter table public.app_settings add column if not exists referral_deposit_50_bonus numeric not null default 20;
alter table public.app_settings add column if not exists referral_deposit_bonus numeric not null default 20;
alter table public.app_settings add column if not exists custom_recent_winners jsonb;
alter table public.app_settings add column if not exists custom_leaderboard jsonb;

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

-- 2. Fixed Preset Bank Buttons (8 Deposit + 8 Withdraw — editable message per bank)
create table if not exists public.payment_buttons (
  id uuid primary key default gen_random_uuid(),
  flow_type text not null check (flow_type in ('deposit', 'withdraw')),
  bank_key text,
  label text not null,
  response_text text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.payment_buttons add column if not exists bank_key text;

-- Clean up any legacy rows without a bank_key before adding unique constraint
update public.payment_buttons set bank_key = 'telebirr' where bank_key is null and lower(label) like '%telebirr%';
update public.payment_buttons set bank_key = 'cbe_birr' where bank_key is null and lower(label) like '%cbe birr%';
update public.payment_buttons set bank_key = 'cbe' where bank_key is null and lower(label) = 'cbe';
delete from public.payment_buttons where bank_key is null;

create unique index if not exists idx_payment_buttons_flow_bank on public.payment_buttons (flow_type, bank_key);

-- Seed all 8 preset banks for Deposit and Withdraw
insert into public.payment_buttons (flow_type, bank_key, label, response_text, sort_order, is_active)
values
  ('deposit', 'telebirr', 'Telebirr', 'Send your deposit via Telebirr, then send a screenshot or confirmation message here.', 1, true),
  ('deposit', 'cbe', 'CBE', 'Transfer your deposit to our CBE account, then reply here with your receipt photo or transaction ID.', 2, true),
  ('deposit', 'cbe_birr', 'CBE Birr', 'Send your deposit via CBE Birr, then send your receipt photo or confirmation message here.', 3, true),
  ('deposit', 'abyssinia', 'Abyssinia Bank', 'Transfer your deposit to Abyssinia Bank, then reply here with your receipt photo or transaction ID.', 4, true),
  ('deposit', 'awash', 'Awash Bank', 'Transfer your deposit to Awash Bank, then reply here with your receipt photo or transaction ID.', 5, true),
  ('deposit', 'kaffi', 'Kaffi', 'Send your deposit via Kaffi, then reply here with your receipt photo or confirmation message here.', 6, true),
  ('deposit', 'ebirr', 'E-Birr', 'Send your deposit via E-Birr, then reply here with your receipt photo or confirmation message here.', 7, true),
  ('deposit', 'coop', 'Coop', 'Transfer your deposit to Coop Bank, then reply here with your receipt photo or transaction ID.', 8, true),
  ('withdraw', 'telebirr', 'Telebirr', '', 1, true),
  ('withdraw', 'cbe', 'CBE', '', 2, true),
  ('withdraw', 'cbe_birr', 'CBE Birr', '', 3, true),
  ('withdraw', 'abyssinia', 'Abyssinia Bank', '', 4, true),
  ('withdraw', 'awash', 'Awash Bank', '', 5, true),
  ('withdraw', 'kaffi', 'Kaffi', '', 6, true),
  ('withdraw', 'ebirr', 'E-Birr', '', 7, true),
  ('withdraw', 'coop', 'Coop', '', 8, true)
on conflict (flow_type, bank_key) do nothing;

-- 3. Players & Wallets
create table if not exists public.players (
  id text primary key,
  name text not null,
  username text,
  language text not null default 'en' check (language in ('en', 'am', 'om')),
  deposited_birr numeric not null default 100,
  won_birr numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Completed Game Rounds & House Commission Ledger
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  stake_birr numeric not null,
  round_number int not null,
  players_count int not null default 0,
  entries_count int not null default 0,
  total_pot_birr numeric not null default 0,
  commission_percent numeric not null default 20,
  commission_birr numeric not null default 0,
  prize_pool_birr numeric not null default 0,
  winners jsonb not null default '[]'::jsonb,
  called_numbers jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz not null default now()
);

create index if not exists idx_rounds_ended_at on public.rounds (ended_at desc);

-- 5. Deposit & Withdrawal Requests (tracks exact Bank & Birr Amount from Admin Group)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text not null,
  player_username text,
  tx_type text not null check (tx_type in ('deposit', 'withdraw')),
  bank_key text,
  button_id uuid,
  button_label text,
  user_message text,
  user_photo_file_id text,
  amount_birr numeric,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'done', 'incorrect')),
  resolved_by text,
  admin_group_id text,
  admin_group_message_id bigint,
  admin_group_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.transactions add column if not exists bank_key text;
alter table public.transactions add column if not exists resolved_by text;
alter table public.transactions add column if not exists admin_group_messages jsonb not null default '[]'::jsonb;

create index if not exists idx_transactions_created_at on public.transactions (created_at desc);
create index if not exists idx_transactions_bank_key on public.transactions (tx_type, bank_key, status);

-- 6. Bot User Session State
create table if not exists public.bot_sessions (
  telegram_user_id text primary key,
  language text not null default 'en' check (language in ('en', 'am', 'om')),
  pending_action text,
  selected_button_id uuid,
  selected_button_label text,
  selected_bank_key text,
  updated_at timestamptz not null default now()
);

alter table public.bot_sessions add column if not exists selected_bank_key text;

-- 7. Referral Ledger (tracks who referred who + join bonus + 100+ Birr first deposit bonus)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null,
  referrer_name text not null,
  referrer_username text,
  referred_id text not null unique,
  referred_name text not null,
  referred_username text,
  signup_bonus_birr numeric not null default 0,
  deposit_50_bonus_birr numeric not null default 0,
  deposit_50_bonus_paid boolean not null default false,
  first_50_deposit_birr numeric,
  deposit_50_bonus_paid_at timestamptz,
  deposit_bonus_birr numeric not null default 0,
  deposit_bonus_paid boolean not null default false,
  first_qualifying_deposit_birr numeric,
  created_at timestamptz not null default now(),
  deposit_bonus_paid_at timestamptz
);

alter table public.referrals add column if not exists deposit_50_bonus_birr numeric not null default 0;
alter table public.referrals add column if not exists deposit_50_bonus_paid boolean not null default false;
alter table public.referrals add column if not exists first_50_deposit_birr numeric;
alter table public.referrals add column if not exists deposit_50_bonus_paid_at timestamptz;

create index if not exists idx_referrals_referrer_id on public.referrals (referrer_id);
create index if not exists idx_referrals_created_at on public.referrals (created_at desc);

-- 8. Bot Broadcast Queue (Admin dashboard queues messages, bot server sends to all users)
create table if not exists public.bot_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message_text text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'completed', 'failed')),
  total_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_bot_broadcasts_created_at on public.bot_broadcasts (created_at desc);

-- Lock down direct anon access
alter table public.app_settings enable row level security;
alter table public.payment_buttons enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.transactions enable row level security;
alter table public.bot_sessions enable row level security;
alter table public.referrals enable row level security;
alter table public.bot_broadcasts enable row level security;

-- Helper: assert admin PIN
create or replace function public._assert_admin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  select admin_pin into v_pin from public.app_settings where id = 1;
  if v_pin is null then
    v_pin := '1234';
  end if;
  if coalesce(trim(p_pin), '') <> v_pin then
    raise exception 'Invalid Admin PIN';
  end if;
end;
$$;

-- RPC: Load full Admin Dashboard snapshot
create or replace function public.admin_get_dashboard(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_buttons jsonb;
  v_players jsonb;
  v_rounds jsonb;
  v_transactions jsonb;
  v_referrals jsonb;
  v_broadcasts jsonb;
  v_stats jsonb;
begin
  perform public._assert_admin_pin(p_pin);

  select to_jsonb(s) - 'admin_pin' into v_settings
  from public.app_settings s where s.id = 1;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.flow_type asc, b.sort_order asc, b.created_at asc), '[]'::jsonb)
  into v_buttons
  from public.payment_buttons b;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb)
  into v_players
  from (select * from public.players order by updated_at desc limit 500) p;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.ended_at desc), '[]'::jsonb)
  into v_rounds
  from (select * from public.rounds order by ended_at desc limit 300) r;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_transactions
  from (select * from public.transactions order by created_at desc limit 500) t;

  select coalesce(jsonb_agg(to_jsonb(rf) order by rf.created_at desc), '[]'::jsonb)
  into v_referrals
  from (select * from public.referrals order by created_at desc limit 1000) rf;

  select coalesce(jsonb_agg(to_jsonb(bc) order by bc.created_at desc), '[]'::jsonb)
  into v_broadcasts
  from (select * from public.bot_broadcasts order by created_at desc limit 50) bc;

  select jsonb_build_object(
    'totalRounds', (select count(*) from public.rounds),
    'totalCommissionBirr', (select coalesce(sum(commission_birr), 0) from public.rounds),
    'totalPotBirr', (select coalesce(sum(total_pot_birr), 0) from public.rounds),
    'totalPlayers', (select count(*) from public.players),
    'totalDepositedBalance', (select coalesce(sum(deposited_birr), 0) from public.players),
    'totalWonBalance', (select coalesce(sum(won_birr), 0) from public.players),
    'acceptedDepositsBirr', (select coalesce(sum(amount_birr), 0) from public.transactions where tx_type = 'deposit' and status = 'accepted'),
    'completedWithdrawalsBirr', (select coalesce(sum(amount_birr), 0) from public.transactions where tx_type = 'withdraw' and status = 'done'),
    'pendingRequests', (select count(*) from public.transactions where status = 'pending'),
    'totalReferrals', (select count(*) from public.referrals),
    'qualified50Deposits', (select count(*) from public.referrals where deposit_50_bonus_paid = true),
    'qualifiedReferralDeposits', (select count(*) from public.referrals where deposit_bonus_paid = true),
    'totalReferralBonusesBirr', (select coalesce(sum(signup_bonus_birr + deposit_50_bonus_birr + deposit_bonus_birr), 0) from public.referrals)
  ) into v_stats;

  return jsonb_build_object(
    'settings', v_settings,
    'payment_buttons', v_buttons,
    'players', v_players,
    'rounds', v_rounds,
    'transactions', v_transactions,
    'referrals', v_referrals,
    'broadcasts', v_broadcasts,
    'stats', v_stats
  );
end;
$$;

-- RPC: Update bot intro/shared messages, primary & extra admin group IDs, and optionally Admin PIN
drop function if exists public.admin_update_settings(text, text, text, text, text, text);
create or replace function public.admin_update_settings(
  p_pin text,
  p_admin_group_id text,
  p_deposit_intro text,
  p_withdraw_intro text,
  p_withdraw_prompt text,
  p_new_pin text default null,
  p_extra_group_ids text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.app_settings;
begin
  perform public._assert_admin_pin(p_pin);

  update public.app_settings
  set
    admin_group_id = coalesce(trim(p_admin_group_id), admin_group_id),
    extra_group_ids = coalesce(trim(p_extra_group_ids), extra_group_ids),
    deposit_intro_text = coalesce(nullif(trim(p_deposit_intro), ''), deposit_intro_text),
    withdraw_intro_text = coalesce(nullif(trim(p_withdraw_intro), ''), withdraw_intro_text),
    withdraw_prompt_text = coalesce(nullif(trim(p_withdraw_prompt), ''), withdraw_prompt_text),
    admin_pin = case when coalesce(trim(p_new_pin), '') <> '' then trim(p_new_pin) else admin_pin end,
    updated_at = now()
  where id = 1
  returning * into v_row;

  return to_jsonb(v_row) - 'admin_pin';
end;
$$;

-- RPC: Update referral bonus amounts (join bonus + first 50+ Birr deposit bonus + first 100+ Birr deposit bonus)
drop function if exists public.admin_update_referral_settings(text, numeric, numeric);
create or replace function public.admin_update_referral_settings(
  p_pin text,
  p_signup_bonus numeric,
  p_deposit_bonus numeric,
  p_deposit_50_bonus numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.app_settings;
begin
  perform public._assert_admin_pin(p_pin);

  update public.app_settings
  set
    referral_signup_bonus = greatest(0, coalesce(p_signup_bonus, 0)),
    referral_deposit_bonus = greatest(0, coalesce(p_deposit_bonus, 0)),
    referral_deposit_50_bonus = case
      when p_deposit_50_bonus is not null then greatest(0, p_deposit_50_bonus)
      else referral_deposit_50_bonus
    end,
    updated_at = now()
  where id = 1
  returning * into v_row;

  return to_jsonb(v_row) - 'admin_pin';
end;
$$;

-- RPC: Edit the reply message and visibility for one of the 8 preset banks
create or replace function public.admin_update_bank_message(
  p_pin text,
  p_id uuid,
  p_response_text text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_buttons;
begin
  perform public._assert_admin_pin(p_pin);

  update public.payment_buttons
  set
    response_text = coalesce(p_response_text, ''),
    is_active = coalesce(p_is_active, true)
  where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- RPC: Adjust player wallet balances directly from Admin Dashboard
create or replace function public.admin_adjust_player_balance(
  p_pin text,
  p_player_id text,
  p_deposited_delta numeric default 0,
  p_won_delta numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.players;
begin
  perform public._assert_admin_pin(p_pin);

  update public.players
  set
    deposited_birr = greatest(0, deposited_birr + coalesce(p_deposited_delta, 0)),
    won_birr = greatest(0, won_birr + coalesce(p_won_delta, 0)),
    updated_at = now()
  where id = p_player_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- RPC: Queue a broadcast message to be sent by the Telegram bot to all users
create or replace function public.admin_queue_broadcast(
  p_pin text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bot_broadcasts;
  v_clean text;
begin
  perform public._assert_admin_pin(p_pin);
  v_clean := trim(coalesce(p_message, ''));
  if v_clean = '' then
    raise exception 'Broadcast message cannot be empty';
  end if;

  insert into public.bot_broadcasts (message_text, status)
  values (v_clean, 'pending')
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- RPC: Clear selected data scopes from Admin Dashboard
create or replace function public.admin_clear_data(
  p_pin text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_admin_pin(p_pin);

  if p_scope = 'rounds' then
    delete from public.rounds;
  elsif p_scope = 'transactions' then
    delete from public.transactions;
  elsif p_scope = 'referrals' then
    delete from public.referrals;
  elsif p_scope = 'broadcasts' then
    delete from public.bot_broadcasts;
  elsif p_scope = 'players' then
    delete from public.players;
  elsif p_scope = 'all' then
    delete from public.rounds;
    delete from public.transactions;
    delete from public.referrals;
    delete from public.bot_broadcasts;
    delete from public.players;
  else
    raise exception 'Unknown clear scope: %', p_scope;
  end if;

  return jsonb_build_object('ok', true, 'scope', p_scope);
end;
$$;

grant execute on function public.admin_get_dashboard(text) to anon, authenticated;
grant execute on function public.admin_update_settings(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_referral_settings(text, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.admin_update_bank_message(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.admin_adjust_player_balance(text, text, numeric, numeric) to anon, authenticated;
grant execute on function public.admin_queue_broadcast(text, text) to anon, authenticated;
grant execute on function public.admin_clear_data(text, text) to anon, authenticated;
