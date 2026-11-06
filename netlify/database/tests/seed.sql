-- Local development seed (TEST ONLY — loaded by the database tests, never deployed).
-- Police stations below are PLACEHOLDERS for testing only. Before going live, load the
-- real stations with numbers you have verified with Uganda Police for each district.
insert into public.police_stations (name, district, phone, lat, lng) values
  ('TEST — Central Station (placeholder)', 'Kampala', '+256700000001', 0.3136, 32.5811),
  ('TEST — Kira Division (placeholder)',   'Wakiso',  '+256700000002', 0.3972, 32.6398),
  ('TEST — Entebbe (placeholder)',         'Wakiso',  '+256700000003', 0.0560, 32.4790);

-- Super admins are set with the SUPER_ADMIN_PHONES environment variable.
