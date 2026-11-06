-- SafeNest Phase 1 — Netlify Database
-- Idempotent: safe to run more than once (the app also runs it on first use if the
-- tables are missing — see apps/web/lib/server/db.ts).
-- Roles: super_admin, estate_manager (pays), guard, resident (free)
--
-- Access control: apps never talk to the database directly. Every request goes
-- through the API (apps/web/app/api), which sets app.user_id for the transaction.
-- auth.uid() reads it, and the functions below enforce who may do what — so the
-- rules live in one place and are covered by netlify/database/tests.

-- ================================================================ auth
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+256\d{9}$'),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- One-time SMS login codes. Only a hash of the code is stored.
create table if not exists auth.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on auth.otp_codes (phone, created_at desc);

-- The signed-in user for the current transaction (set by the API).
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Roles: super_admin, estate_manager (pays), guard, resident (free)


do $$ begin create type public.app_role as enum ('super_admin', 'estate_manager', 'guard', 'resident'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('manager', 'guard', 'resident'); exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum ('trial', 'active', 'past_due', 'suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pass_status as enum ('active', 'used', 'expired', 'revoked'); exception when duplicate_object then null; end $$;
do $$ begin create type public.entry_method as enum ('pass_qr', 'pass_code', 'walk_in'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sos_status as enum ('active', 'acknowledged', 'resolved', 'false_alarm'); exception when duplicate_object then null; end $$;
do $$ begin create type public.evidence_kind as enum ('photo', 'video', 'audio'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique,
  full_name text,
  role public.app_role not null default 'resident',
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- estates
create table if not exists public.estates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 1),
  district text,
  address text,
  gate_phone text, -- guard house line; used for the offline SMS fallback
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  manager_id uuid not null references public.profiles (id),
  subscription_status public.subscription_status not null default 'trial',
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  block text,
  created_at timestamptz not null default now(),
  unique (estate_id, label)
);

-- One row per person per estate. Residents point at a unit.
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (estate_id, user_id),
  check (role <> 'resident' or unit_id is not null)
);
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_estate_role_idx on public.memberships (estate_id, role);

-- Managers register residents/guards by phone before they sign up.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  phone text not null check (phone ~ '^\+2567\d{8}$'),
  full_name text,
  role public.member_role not null check (role <> 'manager'),
  invited_by uuid not null references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (estate_id, phone),
  check (role <> 'resident' or unit_id is not null)
);
create index if not exists invitations_pending_phone_idx on public.invitations (phone) where accepted_at is null;

-- ---------------------------------------------------------------- guest passes
create table if not exists public.guest_passes (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  guest_name text not null check (length(trim(guest_name)) > 0),
  guest_phone text,
  vehicle_plate text,
  code char(6) not null check (code ~ '^\d{6}$'),
  qr_token uuid not null default gen_random_uuid() unique,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  status public.pass_status not null default 'active',
  used_at timestamptz,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (valid_until > valid_from)
);
-- A 6-digit code is only unique among the estate's *active* passes, so codes recycle.
create unique index if not exists guest_passes_active_code on public.guest_passes (estate_id, code) where status = 'active';
create index if not exists guest_passes_unit_idx on public.guest_passes (unit_id, created_at desc);

create table if not exists public.visitor_logs (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  pass_id uuid references public.guest_passes (id) on delete set null,
  guest_name text not null,
  guest_phone text,
  vehicle_plate text,
  guard_id uuid not null references public.profiles (id),
  method public.entry_method not null,
  notes text,
  entry_at timestamptz not null default now(),
  exit_at timestamptz
);
create index if not exists visitor_logs_estate_idx on public.visitor_logs (estate_id, entry_at desc);

-- ---------------------------------------------------------------- SOS
-- Maintained by the super admin. Phone numbers must be verified before go-live.
create table if not exists public.police_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  phone text not null,
  lat double precision not null,
  lng double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  user_id uuid not null references public.profiles (id),
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  status public.sos_status not null default 'active',
  police_station_id uuid references public.police_stations (id),
  acknowledged_by uuid references public.profiles (id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sos_alerts_estate_idx on public.sos_alerts (estate_id, created_at desc);

create table if not exists public.sos_evidence (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.sos_alerts (id) on delete cascade,
  kind public.evidence_kind not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

-- Audit of every push/SMS sent for an alert (written by the edge function).
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.sos_alerts (id) on delete cascade,
  recipient text not null,
  recipient_type text not null, -- guard | manager | police
  channel text not null,        -- push | sms
  status text not null,         -- sent | failed | skipped
  detail text,
  created_at timestamptz not null default now()
);

-- ================================================================ helpers
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.member_role_in(p_estate uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where estate_id = p_estate and user_id = auth.uid() and active;
$$;

create or replace function public.is_estate_member(p_estate uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or public.member_role_in(p_estate) is not null;
$$;

create or replace function public.is_estate_staff(p_estate uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or coalesce(public.member_role_in(p_estate) in ('manager', 'guard'), false);
$$;

create or replace function public.is_estate_manager(p_estate uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or coalesce(public.member_role_in(p_estate) = 'manager', false);
$$;

create or replace function public.my_unit_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select unit_id from public.memberships
  where user_id = auth.uid() and active and unit_id is not null;
$$;

-- Can the caller (as estate staff) see this person's profile?
create or replace function public.can_view_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or public.is_super_admin() or exists (
    select 1 from public.memberships them
    join public.memberships me on me.estate_id = them.estate_id
    where them.user_id = p_user and me.user_id = auth.uid()
      and me.active and me.role in ('manager', 'guard')
  );
$$;

-- ================================================================ new users
-- Runs when someone verifies their phone for the first time. Creates their profile
-- and turns any pending invitations for that phone into estate memberships.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := case when new.phone is null or new.phone = '' then null
                       else '+' || ltrim(new.phone, '+') end;
  v_inv record;
  v_name text;
begin
  select full_name into v_name from public.invitations
  where phone = v_phone and accepted_at is null and full_name is not null
  order by created_at desc limit 1;

  insert into public.profiles (id, phone, full_name)
  values (new.id, v_phone, v_name)
  on conflict (id) do nothing;

  for v_inv in
    select * from public.invitations where phone = v_phone and accepted_at is null
  loop
    insert into public.memberships (estate_id, user_id, unit_id, role)
    values (v_inv.estate_id, new.id, v_inv.unit_id, v_inv.role)
    on conflict (estate_id, user_id) do nothing;
    update public.invitations set accepted_at = now() where id = v_inv.id;
  end loop;

  -- Guards get the guard app role; everyone else stays 'resident'.
  if exists (select 1 from public.memberships where user_id = new.id and role = 'guard') then
    update public.profiles set role = 'guard' where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================ estates & members
-- Any signed-in person can register an estate and becomes its manager (on trial).
create or replace function public.create_estate(
  p_name text, p_district text default null, p_address text default null,
  p_lat double precision default null, p_lng double precision default null
) returns public.estates language plpgsql security definer set search_path = '' as $$
declare v_estate public.estates;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'guard') then
    raise exception 'Guard accounts cannot register estates';
  end if;

  insert into public.estates (name, district, address, lat, lng, manager_id)
  values (trim(p_name), p_district, p_address, p_lat, p_lng, auth.uid())
  returning * into v_estate;

  insert into public.memberships (estate_id, user_id, role)
  values (v_estate.id, auth.uid(), 'manager');

  update public.profiles set role = 'estate_manager'
  where id = auth.uid() and role = 'resident';
  return v_estate;
end $$;

-- Register a resident or guard by phone. If they already have an account they are
-- added straight away; otherwise the invitation is applied when they first sign in.
create or replace function public.invite_member(
  p_estate uuid, p_phone text, p_full_name text, p_role public.member_role, p_unit uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_estate_manager(p_estate) then raise exception 'Only the estate manager can add members'; end if;
  if p_role = 'manager' then raise exception 'Use the admin console to add managers'; end if;
  if p_phone !~ '^\+2567\d{8}$' then raise exception 'Phone must be a Ugandan mobile in +2567XXXXXXXX format'; end if;
  if p_role = 'resident' and p_unit is null then raise exception 'Residents need a unit'; end if;
  if p_unit is not null and not exists (select 1 from public.units where id = p_unit and estate_id = p_estate) then
    raise exception 'Unit does not belong to this estate';
  end if;

  select id into v_user from public.profiles where phone = p_phone;

  if v_user is not null then
    insert into public.memberships (estate_id, user_id, unit_id, role)
    values (p_estate, v_user, p_unit, p_role)
    on conflict (estate_id, user_id)
      do update set unit_id = excluded.unit_id, role = excluded.role, active = true;
    update public.profiles set full_name = coalesce(full_name, nullif(trim(p_full_name), '')) where id = v_user;
    if p_role = 'guard' then
      update public.profiles set role = 'guard' where id = v_user and role = 'resident';
    end if;
    return jsonb_build_object('status', 'added', 'user_id', v_user);
  end if;

  insert into public.invitations (estate_id, unit_id, phone, full_name, role, invited_by)
  values (p_estate, p_unit, p_phone, nullif(trim(p_full_name), ''), p_role, auth.uid())
  on conflict (estate_id, phone)
    do update set unit_id = excluded.unit_id, role = excluded.role,
                  full_name = excluded.full_name, accepted_at = null;
  return jsonb_build_object('status', 'invited');
end $$;

-- ================================================================ guest passes
create or replace function public.random_code6()
returns text language sql volatile set search_path = '' as $$
  select lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;

create or replace function public.create_guest_pass(
  p_unit uuid, p_guest_name text, p_valid_until timestamptz,
  p_guest_phone text default null, p_vehicle_plate text default null,
  p_valid_from timestamptz default now()
) returns public.guest_passes language plpgsql security definer set search_path = '' as $$
declare
  v_estate uuid;
  v_status public.subscription_status;
  v_pass public.guest_passes;
  i int := 0;
begin
  select u.estate_id, e.subscription_status into v_estate, v_status
  from public.units u join public.estates e on e.id = u.estate_id where u.id = p_unit;
  if v_estate is null then raise exception 'Unit not found'; end if;
  if not (p_unit in (select public.my_unit_ids()) or public.is_estate_manager(v_estate)) then
    raise exception 'You can only create passes for your own unit';
  end if;
  if v_status = 'suspended' then raise exception 'This estate''s SafeNest subscription is suspended'; end if;
  if p_valid_until <= now() then raise exception 'Pass must end in the future'; end if;
  if p_valid_until - coalesce(p_valid_from, now()) > interval '7 days' then
    raise exception 'Passes can be valid for at most 7 days';
  end if;

  loop
    i := i + 1;
    begin
      insert into public.guest_passes
        (estate_id, unit_id, created_by, guest_name, guest_phone, vehicle_plate, code, valid_from, valid_until)
      values
        (v_estate, p_unit, auth.uid(), trim(p_guest_name), nullif(trim(p_guest_phone), ''),
         upper(nullif(trim(p_vehicle_plate), '')), public.random_code6(), coalesce(p_valid_from, now()), p_valid_until)
      returning * into v_pass;
      return v_pass;
    exception when unique_violation then
      if i >= 25 then raise exception 'Could not allocate a pass code, try again'; end if;
    end;
  end loop;
end $$;

create or replace function public.revoke_guest_pass(p_pass uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.guest_passes set status = 'revoked'
  where id = p_pass and status = 'active'
    and (created_by = auth.uid() or public.is_estate_manager(estate_id));
  if not found then raise exception 'Pass not found or already closed'; end if;
end $$;

-- Gate check. p_input is either the QR token (UUID) or the 6-digit code.
-- A valid pass is consumed atomically and logged as an entry.
create or replace function public.verify_guest_pass(p_estate uuid, p_input text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_input text := trim(p_input);
  v_pass public.guest_passes;
  v_method public.entry_method;
  v_unit text;
  v_log uuid;
  fail jsonb := jsonb_build_object('ok', false, 'guest_name', null, 'unit_label', null,
                                   'vehicle_plate', null, 'valid_until', null, 'log_id', null);
begin
  if not public.is_estate_staff(p_estate) then raise exception 'Only guards of this estate can verify passes'; end if;

  if v_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_method := 'pass_qr';
    select * into v_pass from public.guest_passes where qr_token = v_input::uuid and estate_id = p_estate;
  elsif v_input ~ '^\d{6}$' then
    v_method := 'pass_code';
    select * into v_pass from public.guest_passes
    where code = v_input and estate_id = p_estate and status = 'active';
  end if;

  if v_pass.id is null then return fail || jsonb_build_object('reason', 'not_found'); end if;

  select label into v_unit from public.units where id = v_pass.unit_id;
  fail := fail || jsonb_build_object('guest_name', v_pass.guest_name, 'unit_label', v_unit,
                                     'vehicle_plate', v_pass.vehicle_plate, 'valid_until', v_pass.valid_until);

  if v_pass.status = 'revoked' then return fail || jsonb_build_object('reason', 'revoked'); end if;
  if v_pass.status = 'used' then return fail || jsonb_build_object('reason', 'already_used'); end if;
  if now() > v_pass.valid_until or v_pass.status = 'expired' then
    update public.guest_passes set status = 'expired' where id = v_pass.id and status = 'active';
    return fail || jsonb_build_object('reason', 'expired');
  end if;
  if now() < v_pass.valid_from then return fail || jsonb_build_object('reason', 'not_yet_valid'); end if;

  update public.guest_passes set status = 'used', used_at = now(), verified_by = auth.uid()
  where id = v_pass.id and status = 'active';
  if not found then return fail || jsonb_build_object('reason', 'already_used'); end if;

  insert into public.visitor_logs (estate_id, unit_id, pass_id, guest_name, guest_phone, vehicle_plate, guard_id, method)
  values (p_estate, v_pass.unit_id, v_pass.id, v_pass.guest_name, v_pass.guest_phone, v_pass.vehicle_plate, auth.uid(), v_method)
  returning id into v_log;

  return jsonb_build_object('ok', true, 'reason', 'valid', 'guest_name', v_pass.guest_name, 'unit_label', v_unit,
                            'vehicle_plate', v_pass.vehicle_plate, 'valid_until', v_pass.valid_until, 'log_id', v_log);
end $$;

create or replace function public.log_walk_in(
  p_estate uuid, p_guest_name text, p_unit uuid default null,
  p_guest_phone text default null, p_vehicle_plate text default null, p_notes text default null
) returns public.visitor_logs language plpgsql security definer set search_path = '' as $$
declare v_log public.visitor_logs;
begin
  if not public.is_estate_staff(p_estate) then raise exception 'Only guards can log visitors'; end if;
  insert into public.visitor_logs (estate_id, unit_id, guest_name, guest_phone, vehicle_plate, guard_id, method, notes)
  values (p_estate, p_unit, trim(p_guest_name), nullif(trim(p_guest_phone), ''),
          upper(nullif(trim(p_vehicle_plate), '')), auth.uid(), 'walk_in', p_notes)
  returning * into v_log;
  return v_log;
end $$;

create or replace function public.mark_exit(p_log uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.visitor_logs set exit_at = now()
  where id = p_log and exit_at is null and public.is_estate_staff(estate_id);
  if not found then raise exception 'Visit not found or already checked out'; end if;
end $$;

-- Public view of a pass for the link the resident shares with their guest.
-- The token is an unguessable UUID; only the minimum is exposed.
create or replace function public.get_public_pass(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'guest_name', p.guest_name, 'code', p.code, 'qr_token', p.qr_token,
    'estate_name', e.name, 'unit_label', u.label,
    'valid_from', p.valid_from, 'valid_until', p.valid_until,
    'status', case when p.status = 'active' and now() > p.valid_until then 'expired' else p.status::text end)
  from public.guest_passes p
  join public.estates e on e.id = p.estate_id
  join public.units u on u.id = p.unit_id
  where p.qr_token = p_token;
$$;

-- ================================================================ SOS
create or replace function public.nearest_police_station(p_lat double precision, p_lng double precision)
returns table (id uuid, name text, phone text, distance_km double precision)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.phone,
    6371 * 2 * asin(sqrt(
      power(sin(radians(s.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
    )) as distance_km
  from public.police_stations s
  where s.active
  order by distance_km
  limit 1;
$$;

-- Creates the alert. Never blocked by subscription status. A repeat press within
-- 2 minutes returns the same open alert instead of creating duplicates.
create or replace function public.trigger_sos(
  p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_estate uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_m public.memberships;
  v_alert uuid;
  v_station uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_m from public.memberships
  where user_id = auth.uid() and active and (p_estate is null or estate_id = p_estate)
  order by (role = 'resident') desc, created_at limit 1;
  if v_m.id is null then raise exception 'You are not registered to an estate'; end if;

  select id into v_alert from public.sos_alerts
  where user_id = auth.uid() and status = 'active' and created_at > now() - interval '2 minutes'
  order by created_at desc limit 1;
  if v_alert is not null then
    update public.sos_alerts set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy where id = v_alert;
    return v_alert;
  end if;

  select id into v_station from public.nearest_police_station(p_lat, p_lng);

  insert into public.sos_alerts (estate_id, unit_id, user_id, lat, lng, accuracy_m, police_station_id)
  values (v_m.estate_id, v_m.unit_id, auth.uid(), p_lat, p_lng, p_accuracy, v_station)
  returning id into v_alert;
  return v_alert;
end $$;

create or replace function public.update_sos_status(p_alert uuid, p_status public.sos_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_a public.sos_alerts;
begin
  select * into v_a from public.sos_alerts where id = p_alert;
  if v_a.id is null then raise exception 'Alert not found'; end if;

  -- The person who raised it may cancel it as a false alarm; staff handle the rest.
  if not (public.is_estate_staff(v_a.estate_id) or (v_a.user_id = auth.uid() and p_status = 'false_alarm')) then
    raise exception 'Not allowed';
  end if;

  update public.sos_alerts set
    status = p_status,
    acknowledged_by = case when p_status = 'acknowledged' then auth.uid() else acknowledged_by end,
    acknowledged_at = case when p_status = 'acknowledged' then now() else acknowledged_at end,
    resolved_at = case when p_status in ('resolved', 'false_alarm') then now() else resolved_at end
  where id = p_alert;
end $$;

-- ================================================================ evidence access
create or replace function public.can_upload_evidence(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sos_alerts a
    where a.id::text = split_part(p_path, '/', 1) and a.user_id = auth.uid()
      and a.created_at > now() - interval '6 hours');
$$;

create or replace function public.can_view_evidence(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sos_alerts a
    where a.id::text = split_part(p_path, '/', 1)
      and (a.user_id = auth.uid() or public.is_estate_staff(a.estate_id)));
$$;
