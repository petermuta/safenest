-- SafeNest Phase 1b: police chain of command, resident identity (NIN + selfie),
-- community alerts. Idempotent: safe to run more than once.

-- ================================================================ helpers
create or replace function public.distance_km(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ================================================================ police hierarchy
-- A police "station" is now a unit at one of three levels:
--   post (receives SOS, dispatches officers) → regional HQ → headquarters
alter table public.police_stations add column if not exists level text not null default 'post';
alter table public.police_stations add column if not exists parent_id uuid references public.police_stations (id) on delete set null;
do $$ begin
  alter table public.police_stations add constraint police_stations_level_chk check (level in ('post', 'regional', 'headquarters'));
exception when duplicate_object then null; end $$;

create table if not exists public.police_officers (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.police_stations (id) on delete cascade,
  user_id uuid unique references public.profiles (id) on delete set null,
  phone text not null unique check (phone ~ '^\+256\d{9}$'),
  full_name text not null check (length(trim(full_name)) > 1),
  badge_no text,
  -- officer: sees alerts assigned to them · dispatcher: runs a post · commander: runs a regional HQ or headquarters
  role text not null default 'officer' check (role in ('officer', 'dispatcher', 'commander')),
  on_duty boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists police_officers_station_idx on public.police_officers (station_id);

-- Police workflow on each SOS
alter table public.sos_alerts add column if not exists source text not null default 'button';
alter table public.sos_alerts add column if not exists note text;
alter table public.sos_alerts add column if not exists police_status text not null default 'new';
alter table public.sos_alerts add column if not exists police_level text not null default 'post';
alter table public.sos_alerts add column if not exists assigned_officer_id uuid references public.police_officers (id) on delete set null;
alter table public.sos_alerts add column if not exists assigned_at timestamptz;
alter table public.sos_alerts add column if not exists escalated_regional_at timestamptz;
alter table public.sos_alerts add column if not exists escalated_hq_at timestamptz;
do $$ begin
  alter table public.sos_alerts add constraint sos_alerts_police_status_chk
    check (police_status in ('new', 'assigned', 'en_route', 'on_scene', 'closed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sos_alerts add constraint sos_alerts_police_level_chk
    check (police_level in ('post', 'regional', 'headquarters'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sos_alerts add constraint sos_alerts_source_chk check (source in ('button', 'community'));
exception when duplicate_object then null; end $$;

-- Every police action on resident data is recorded here.
create table if not exists public.police_audit_log (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid references public.police_officers (id) on delete set null,
  user_id uuid,
  station_id uuid references public.police_stations (id) on delete set null,
  action text not null,
  alert_id uuid references public.sos_alerts (id) on delete set null,
  subject_user_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists police_audit_created_idx on public.police_audit_log (created_at desc);
create index if not exists police_audit_subject_idx on public.police_audit_log (subject_user_id);

-- ================================================================ resident identity
-- The NIN is encrypted by the server (AES-256-GCM) before it reaches the database.
-- nin_hash (keyed HMAC) allows exact-match search without decrypting anything.
create table if not exists public.resident_identity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nin_ciphertext text,
  nin_hash text unique,
  nin_last4 text,
  consent_at timestamptz,
  selfie_path text,
  selfie_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ================================================================ community alerts
create table if not exists public.community_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  estate_id uuid references public.estates (id) on delete set null,
  category text not null check (category in ('suspicious_person', 'suspicious_vehicle', 'break_in', 'fire', 'accident', 'noise', 'other')),
  message text not null check (length(trim(message)) between 3 and 500),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_path text,
  status text not null default 'open' check (status in ('open', 'resolved', 'removed')),
  removed_by uuid references public.profiles (id),
  sos_alert_id uuid references public.sos_alerts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists community_alerts_created_idx on public.community_alerts (created_at desc);

create table if not exists public.community_reactions (
  alert_id uuid not null references public.community_alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('see_it_too', 'all_clear')),
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create table if not exists public.community_reports (
  alert_id uuid not null references public.community_alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

-- ================================================================ police functions
create or replace function public.my_officer()
returns public.police_officers language sql stable security definer set search_path = '' as $$
  select * from public.police_officers where user_id = auth.uid() and active limit 1;
$$;

create or replace function public.is_police()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.police_officers where user_id = auth.uid() and active);
$$;

-- SOS goes only to posts, never straight to regional HQ or headquarters.
create or replace function public.nearest_police_station(p_lat double precision, p_lng double precision)
returns table (id uuid, name text, phone text, distance_km double precision)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.phone, public.distance_km(p_lat, p_lng, s.lat, s.lng) as distance_km
  from public.police_stations s
  where s.active and s.level = 'post'
  order by distance_km
  limit 1;
$$;

-- Who in the police may see an alert:
--   post dispatchers/commanders: everything routed to their post
--   post officers: only alerts assigned to them
--   regional HQ: alerts its posts escalated to regional (or beyond)
--   headquarters: alerts escalated to headquarters from its regions
create or replace function public.can_police_view_alert(p_alert uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1
      from public.police_officers o
      join public.sos_alerts a on a.id = p_alert
      left join public.police_stations post on post.id = a.police_station_id
      left join public.police_stations reg on reg.id = post.parent_id
     where o.user_id = auth.uid() and o.active and (
           (o.station_id = a.police_station_id and (o.role in ('dispatcher', 'commander') or a.assigned_officer_id = o.id))
        or (reg.id is not null and o.station_id = reg.id and a.police_level in ('regional', 'headquarters'))
        or (reg.parent_id is not null and o.station_id = reg.parent_id and a.police_level = 'headquarters')));
$$;

create or replace function public.police_log(p_action text, p_alert uuid default null,
                                             p_subject uuid default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.police_officers;
begin
  select * into o from public.my_officer();
  insert into public.police_audit_log (officer_id, user_id, station_id, action, alert_id, subject_user_id, detail)
  values (o.id, auth.uid(), o.station_id, p_action, p_alert, p_subject, p_detail);
end $$;

-- Dispatcher at the alert's post assigns an on-duty officer from the same post.
create or replace function public.police_assign(p_alert uuid, p_officer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.police_officers;
  a public.sos_alerts;
  target public.police_officers;
begin
  select * into me from public.my_officer();
  select * into a from public.sos_alerts where id = p_alert;
  if a.id is null then raise exception 'Alert not found'; end if;
  if me.id is null or me.station_id is distinct from a.police_station_id or me.role not in ('dispatcher', 'commander') then
    raise exception 'Only the dispatcher at this police post can assign officers';
  end if;
  select * into target from public.police_officers where id = p_officer and active;
  if target.id is null or target.station_id <> a.police_station_id then
    raise exception 'That officer is not at this police post';
  end if;
  if not target.on_duty then raise exception 'That officer is not on duty'; end if;

  update public.sos_alerts set assigned_officer_id = target.id, assigned_at = now(),
         police_status = case when police_status in ('new', 'assigned') then 'assigned' else police_status end
   where id = p_alert;
  perform public.police_log('assign', p_alert, a.user_id, jsonb_build_object('officer', target.full_name, 'officer_id', target.id));
end $$;

-- Post → regional HQ (by the post's dispatcher), regional → headquarters (by the regional commander).
create or replace function public.police_escalate(p_alert uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me public.police_officers;
  a public.sos_alerts;
  post public.police_stations;
  reg public.police_stations;
begin
  select * into me from public.my_officer();
  select * into a from public.sos_alerts where id = p_alert;
  if a.id is null or me.id is null then raise exception 'Alert not found'; end if;
  select * into post from public.police_stations where id = a.police_station_id;
  select * into reg from public.police_stations where id = post.parent_id;

  if a.police_level = 'post' and me.station_id = post.id and me.role in ('dispatcher', 'commander') then
    if reg.id is null then raise exception 'This post has no regional HQ set up yet'; end if;
    update public.sos_alerts set police_level = 'regional', escalated_regional_at = now() where id = p_alert;
    perform public.police_log('escalate', p_alert, a.user_id, jsonb_build_object('to', 'regional', 'unit', reg.name));
    return 'regional';
  elsif a.police_level = 'regional' and reg.id is not null and me.station_id = reg.id and me.role = 'commander' then
    if reg.parent_id is null then raise exception 'This regional HQ has no headquarters set up yet'; end if;
    update public.sos_alerts set police_level = 'headquarters', escalated_hq_at = now() where id = p_alert;
    perform public.police_log('escalate', p_alert, a.user_id, jsonb_build_object('to', 'headquarters'));
    return 'headquarters';
  end if;
  raise exception 'You cannot escalate this alert from your unit';
end $$;

-- The assigned officer (or the post's dispatcher) updates progress. Closing it resolves the SOS.
create or replace function public.police_set_status(p_alert uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.police_officers;
  a public.sos_alerts;
begin
  if p_status not in ('en_route', 'on_scene', 'closed') then raise exception 'Unknown status'; end if;
  select * into me from public.my_officer();
  select * into a from public.sos_alerts where id = p_alert;
  if a.id is null or me.id is null then raise exception 'Alert not found'; end if;
  if not (a.assigned_officer_id = me.id
          or (me.station_id = a.police_station_id and me.role in ('dispatcher', 'commander'))) then
    raise exception 'Only the assigned officer or the dispatcher can update this';
  end if;
  update public.sos_alerts set
    police_status = p_status,
    status = case when p_status = 'closed' and status in ('active', 'acknowledged') then 'resolved'
                  when p_status in ('en_route', 'on_scene') and status = 'active' then 'acknowledged'
                  else status end,
    resolved_at = case when p_status = 'closed' then coalesce(resolved_at, now()) else resolved_at end
  where id = p_alert;
  perform public.police_log('status', p_alert, a.user_id, jsonb_build_object('status', p_status));
end $$;

-- ================================================================ community functions
create or replace function public.has_any_membership()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and active);
$$;

-- Estate managers may remove posts made within 1 km of their estate.
create or replace function public.can_moderate_community(p_alert uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.community_alerts c
      join public.memberships m on m.user_id = auth.uid() and m.active and m.role = 'manager'
      join public.estates e on e.id = m.estate_id
     where c.id = p_alert
       and (c.estate_id = e.id or (e.lat is not null and public.distance_km(c.lat, c.lng, e.lat, e.lng) <= 1.0)));
$$;

-- Evidence on an alert may also be viewed by police who can see the alert.
create or replace function public.can_view_evidence(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sos_alerts a
    where a.id::text = split_part(p_path, '/', 1)
      and (a.user_id = auth.uid() or public.is_estate_staff(a.estate_id) or public.can_police_view_alert(a.id)));
$$;
