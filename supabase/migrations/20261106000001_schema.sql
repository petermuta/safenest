-- SafeNest Phase 1 schema
-- Roles: super_admin, estate_manager (pays), guard, resident (free)

create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'estate_manager', 'guard', 'resident');
create type public.member_role as enum ('manager', 'guard', 'resident');
create type public.subscription_status as enum ('trial', 'active', 'past_due', 'suspended');
create type public.pass_status as enum ('active', 'used', 'expired', 'revoked');
create type public.entry_method as enum ('pass_qr', 'pass_code', 'walk_in');
create type public.sos_status as enum ('active', 'acknowledged', 'resolved', 'false_alarm');
create type public.evidence_kind as enum ('photo', 'video', 'audio');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique,
  full_name text,
  role public.app_role not null default 'resident',
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- estates
create table public.estates (
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

create table public.units (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  block text,
  created_at timestamptz not null default now(),
  unique (estate_id, label)
);

-- One row per person per estate. Residents point at a unit.
create table public.memberships (
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
create index on public.memberships (user_id);
create index on public.memberships (estate_id, role);

-- Managers register residents/guards by phone before they sign up.
create table public.invitations (
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
create index on public.invitations (phone) where accepted_at is null;

-- ---------------------------------------------------------------- guest passes
create table public.guest_passes (
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
create unique index guest_passes_active_code on public.guest_passes (estate_id, code) where status = 'active';
create index on public.guest_passes (unit_id, created_at desc);

create table public.visitor_logs (
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
create index on public.visitor_logs (estate_id, entry_at desc);

-- ---------------------------------------------------------------- SOS
-- Maintained by the super admin. Phone numbers must be verified before go-live.
create table public.police_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  phone text not null,
  lat double precision not null,
  lng double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sos_alerts (
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
create index on public.sos_alerts (estate_id, created_at desc);

create table public.sos_evidence (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.sos_alerts (id) on delete cascade,
  kind public.evidence_kind not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

-- Audit of every push/SMS sent for an alert (written by the edge function).
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.sos_alerts (id) on delete cascade,
  recipient text not null,
  recipient_type text not null, -- guard | manager | police
  channel text not null,        -- push | sms
  status text not null,         -- sent | failed | skipped
  detail text,
  created_at timestamptz not null default now()
);

-- Live updates for the guard app and web dashboard
alter publication supabase_realtime add table public.sos_alerts, public.visitor_logs, public.sos_evidence;
