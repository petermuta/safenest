-- Security & privacy hardening. Idempotent: safe to run more than once.

-- ================================================================ PIN second factor
-- Police, estate managers and the super admin confirm sign-in with a PIN after the SMS
-- code, so a stolen SIM (SIM swap) alone can't open those accounts. Hash only (scrypt).
alter table auth.users add column if not exists pin_hash text;
alter table auth.users add column if not exists pin_attempts int not null default 0;
alter table auth.users add column if not exists pin_locked_until timestamptz;

-- ================================================================ SMS cost protection
alter table auth.otp_codes add column if not exists ip text;
create index if not exists otp_codes_ip_idx on auth.otp_codes (ip, created_at desc);
create index if not exists otp_codes_created_idx on auth.otp_codes (created_at desc);

-- ================================================================ evidence integrity
-- SHA-256 of each file at upload, so police and courts can confirm it hasn't changed.
alter table public.sos_evidence add column if not exists sha256 text;

-- ================================================================ account deletion
-- When a resident deletes their account, SOS records stay for police (without the person),
-- and references from other people's records are cleared instead of blocking deletion.
alter table public.sos_alerts alter column user_id drop not null;
alter table public.sos_alerts drop constraint if exists sos_alerts_user_id_fkey;
alter table public.sos_alerts add constraint sos_alerts_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

alter table public.sos_alerts drop constraint if exists sos_alerts_acknowledged_by_fkey;
alter table public.sos_alerts add constraint sos_alerts_acknowledged_by_fkey
  foreign key (acknowledged_by) references public.profiles (id) on delete set null;

alter table public.guest_passes drop constraint if exists guest_passes_verified_by_fkey;
alter table public.guest_passes add constraint guest_passes_verified_by_fkey
  foreign key (verified_by) references public.profiles (id) on delete set null;

alter table public.community_alerts drop constraint if exists community_alerts_removed_by_fkey;
alter table public.community_alerts add constraint community_alerts_removed_by_fkey
  foreign key (removed_by) references public.profiles (id) on delete set null;

alter table public.police_officers drop constraint if exists police_officers_created_by_fkey;
alter table public.police_officers add constraint police_officers_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- ================================================================ append-only audit log
-- Nobody — app, admin or attacker using the app — can edit or delete audit entries.
-- The only changes allowed: links to deleted records becoming empty, and removal of
-- entries older than the 2-year retention period.
create or replace function public.protect_police_audit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.created_at > now() - interval '730 days' then
      raise exception 'Audit log entries cannot be deleted';
    end if;
    return old;
  end if;
  if new.action is distinct from old.action or new.created_at is distinct from old.created_at
     or new.detail is distinct from old.detail or new.user_id is distinct from old.user_id
     or new.subject_user_id is distinct from old.subject_user_id
     or (new.officer_id is distinct from old.officer_id and new.officer_id is not null)
     or (new.station_id is distinct from old.station_id and new.station_id is not null)
     or (new.alert_id is distinct from old.alert_id and new.alert_id is not null) then
    raise exception 'Audit log entries cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists police_audit_append_only on public.police_audit_log;
create trigger police_audit_append_only
  before update or delete on public.police_audit_log
  for each row execute function public.protect_police_audit();

-- ================================================================ retention bookkeeping
create table if not exists public.safenest_jobs (
  name text primary key,
  last_run_at timestamptz,
  last_result jsonb
);

-- ================================================================ account deletion
-- A resident who once worked as a guard, or invited someone, can still delete their account.
alter table public.visitor_logs alter column guard_id drop not null;
alter table public.visitor_logs drop constraint if exists visitor_logs_guard_id_fkey;
alter table public.visitor_logs add constraint visitor_logs_guard_id_fkey
  foreign key (guard_id) references public.profiles (id) on delete set null;

alter table public.invitations alter column invited_by drop not null;
alter table public.invitations drop constraint if exists invitations_invited_by_fkey;
alter table public.invitations add constraint invitations_invited_by_fkey
  foreign key (invited_by) references public.profiles (id) on delete set null;
