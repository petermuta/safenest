-- Private bucket for SOS evidence. Files live at  <alert_id>/<kind>-<timestamp>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sos-evidence', 'sos-evidence', false, 104857600,
        array['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime', 'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do nothing;

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

create policy "sos evidence: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'sos-evidence' and public.can_upload_evidence(name));
create policy "sos evidence: view" on storage.objects for select to authenticated
  using (bucket_id = 'sos-evidence' and public.can_view_evidence(name));

-- Signed-out callers get nothing except the public pass lookup. Postgres grants
-- EXECUTE to PUBLIC by default, so revoke from PUBLIC too, then grant back to signed-in users.
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_estate(text, text, text, double precision, double precision)',
    'public.invite_member(uuid, text, text, public.member_role, uuid)',
    'public.create_guest_pass(uuid, text, timestamptz, text, text, timestamptz)',
    'public.revoke_guest_pass(uuid)',
    'public.verify_guest_pass(uuid, text)',
    'public.log_walk_in(uuid, text, uuid, text, text, text)',
    'public.mark_exit(uuid)',
    'public.trigger_sos(double precision, double precision, double precision, uuid)',
    'public.update_sos_status(uuid, public.sos_status)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
