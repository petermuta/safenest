// Run with: npm run test:db   (no Docker or Netlify needed — uses an in-process Postgres)
// Covers the SQL rules. API-level access checks are covered by scripts/e2e.mjs.

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIG = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const SEED = new URL('./seed.sql', import.meta.url).pathname;
const db = new PGlite();



for (const f of fs.readdirSync(MIG).sort()) {
  try { await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8')); console.log('✓ migration', f); }
  catch (e) { console.error('✗ migration', f, e.message); process.exit(1); }
}
await db.exec(fs.readFileSync(SEED, 'utf8'));
console.log('✓ seed');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

async function as(uid, sql, params = []) {
  await db.exec(`select set_config('app.user_id', '${uid ?? ''}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`select set_config('app.user_id', '', false);`); }
}
async function expectErr(uid, sql, params, msg) {
  try { await as(uid, sql, params); ok(false, msg + ' (no error)'); } catch (e) { ok(true, `${msg} → "${e.message.slice(0, 70)}"`); }
}
const signUp = async (phone) => (await db.query(`insert into auth.users (phone) values ('+' || $1) returning id`, [phone])).rows[0].id;

console.log('\nAuth + profiles');
const mgr = await signUp('256700000100');
let r = await as(mgr, `select phone, role from profiles where id = $1`, [mgr]);
ok(r.rows[0].phone === '+256700000100' && r.rows[0].role === 'resident', 'new user gets profile with E.164 phone');
r = await as(mgr, `select auth.uid() = $1 as me, public.is_super_admin() as admin`, [mgr]);
ok(r.rows[0].me && !r.rows[0].admin, 'auth.uid() reads the signed-in user; not admin');

console.log('\nEstates + units + registration');
r = await as(mgr, `select (create_estate('Kira Gardens', 'Wakiso', 'Kira Rd', 0.40, 32.64)).id`);
const estate = r.rows[0].id;
ok(!!estate, 'manager creates estate');
ok((await db.query(`select role from profiles where id=$1`, [mgr])).rows[0].role === 'estate_manager', 'creator becomes estate_manager');
await as(mgr, `insert into units (estate_id, label) values ($1,'A1'),($1,'A2')`, [estate]);
const units = (await db.query(`select id, label from units order by label`)).rows;
const [A1, A2] = units.map((u) => u.id);
r = await as(mgr, `select invite_member($1, '+256700000200', 'Grace Resident', 'resident', $2) as j`, [estate, A1]);
ok(r.rows[0].j.status === 'invited', 'resident pre-registered by phone');
await as(mgr, `select invite_member($1, '+256700000300', 'Sam Guard', 'guard', null)`, [estate]);
await as(mgr, `select invite_member($1, '+256700000400', 'Other Resident', 'resident', $2)`, [estate, A2]);
await expectErr(mgr, `select invite_member($1, '0772', 'x', 'resident', $2)`, [estate, A1], 'bad phone rejected');

const res = await signUp('256700000200');
const grd = await signUp('256700000300');
const res2 = await signUp('256700000400');
r = await db.query(`select m.role, p.role as app_role, p.full_name from memberships m join profiles p on p.id=m.user_id where m.user_id in ($1,$2)`, [res, grd]);
ok(r.rows.some((x) => x.role === 'resident' && x.full_name === 'Grace Resident'), 'invite becomes resident membership on first sign-in');
ok(r.rows.some((x) => x.role === 'guard' && x.app_role === 'guard'), 'guard gets guard app role');
const stranger = await signUp('256700000999');
r = await as(stranger, `select is_estate_member($1) m`, [estate]);
ok(r.rows[0].m === false, 'stranger is not an estate member');
await expectErr(res, `select invite_member($1, '+256700000555', 'x', 'resident', $2)`, [estate, A1], 'resident cannot add members');
r = await as(res, `select is_estate_manager($1) m, is_estate_staff($1) s, is_estate_member($1) mem`, [estate]);
ok(!r.rows[0].m && !r.rows[0].s && r.rows[0].mem, 'resident: member, not staff or manager');
r = await as(grd, `select is_estate_manager($1) m, is_estate_staff($1) s`, [estate]);
ok(!r.rows[0].m && r.rows[0].s, 'guard: staff, not manager');

console.log('\nGuest passes');
r = await as(res, `select * from create_guest_pass($1, 'Sarah Guest', now() + interval '6 hours', null, 'uba 123x')`, [A1]);
const p1 = r.rows[0];
ok(/^\d{6}$/.test(p1.code) && p1.vehicle_plate === 'UBA 123X', `pass created with code ${p1.code}`);
await expectErr(res, `select * from create_guest_pass($1, 'x', now() + interval '1 hour')`, [A2], 'resident cannot create pass for another unit');
await expectErr(res, `select * from create_guest_pass($1, 'x', now() + interval '9 days')`, [A1], 'pass longer than 7 days rejected');
r = await as(res2, `select $1::uuid in (select my_unit_ids()) as mine`, [A1]);
ok(r.rows[0].mine === false, "other resident's units exclude A1");
r = await as(res, `select $1::uuid in (select my_unit_ids()) as mine`, [A1]);
ok(r.rows[0].mine === true, 'resident owns unit A1');

await expectErr(res, `select verify_guest_pass($1, $2)`, [estate, p1.code], 'resident cannot verify passes');
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p1.code]);
ok(r.rows[0].j.ok === true && r.rows[0].j.unit_label === 'A1', 'guard verifies by code → valid');
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p1.code]);
ok(r.rows[0].j.ok === false && r.rows[0].j.reason === 'not_found', 'same code again → rejected');
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p1.qr_token]);
ok(r.rows[0].j.reason === 'already_used', 'QR of used pass → already_used');

const p2 = (await as(res, `select * from create_guest_pass($1, 'QR Guest', now() + interval '2 hours')`, [A1])).rows[0];
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p2.qr_token]);
ok(r.rows[0].j.ok === true, 'guard verifies by QR token → valid');
const p3 = (await as(res, `select * from create_guest_pass($1, 'Cancelled', now() + interval '2 hours')`, [A1])).rows[0];
await as(res, `select revoke_guest_pass($1)`, [p3.id]);
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p3.qr_token]);
ok(r.rows[0].j.reason === 'revoked', 'revoked pass → revoked');
await db.query(`update guest_passes set valid_from = now() - interval '3 hours', valid_until = now() - interval '1 hour' where id = (select id from guest_passes where guest_name='Cancelled')`);
const p4 = (await as(res, `select * from create_guest_pass($1, 'Late', now() + interval '1 hour')`, [A1])).rows[0];
await db.query(`update guest_passes set valid_from = now() - interval '3 hours', valid_until = now() - interval '1 minute' where id = $1`, [p4.id]);
r = await as(grd, `select verify_guest_pass($1, $2) j`, [estate, p4.code]);
ok(r.rows[0].j.reason === 'expired', 'expired pass → expired');
r = await as(null, `select get_public_pass($1) j`, [p2.qr_token]);
ok(r.rows[0].j.estate_name === 'Kira Gardens' && r.rows[0].j.status === 'used', 'public pass page works for signed-out guest');
await expectErr(null, `select * from create_guest_pass($1, 'x', now() + interval '1 hour')`, [A1], 'signed-out caller cannot create passes');
await expectErr(null, `select trigger_sos(0.1, 32.1)`, [], 'signed-out caller cannot raise SOS');
await expectErr(null, `select verify_guest_pass($1, '123456')`, [estate], 'signed-out caller cannot verify passes');
await expectErr(stranger, `select verify_guest_pass($1, '123456')`, [estate], 'outsider cannot verify passes');
await expectErr(stranger, `select invite_member($1, '+256700000777', 'x', 'guard', null)`, [estate], 'outsider cannot add members');
await expectErr(stranger, `select log_walk_in($1, 'x')`, [estate], 'outsider cannot log visitors');
r = await as(stranger, `select is_estate_staff($1) s, is_estate_manager($1) m`, [estate]);
ok(r.rows[0].s === false && r.rows[0].m === false, 'access checks answer false (not unknown) for outsiders');

console.log('\nVisitor log');
r = await as(grd, `select (log_walk_in($1, 'Boda delivery', $2, null, 'ubx 1')).id`, [estate, A2]);
const walk = r.rows[0].id;
await as(grd, `select mark_exit($1)`, [walk]);
r = await as(grd, `select count(*)::int n, count(exit_at)::int out from visitor_logs`);
ok(r.rows[0].n === 3 && r.rows[0].out === 1, 'entries logged (2 passes + 1 walk-in), walk-in checked out');
r = await db.query(`select count(*)::int n from visitor_logs where unit_id = $1`, [A1]);
ok(r.rows[0].n === 2, 'two pass entries logged against A1');

console.log('\nSOS');
r = await as(res, `select trigger_sos(0.398, 32.640, 12) id`);
const alert = r.rows[0].id;
r = await db.query(`select s.name from sos_alerts a join police_stations s on s.id = a.police_station_id where a.id=$1`, [alert]);
ok(r.rows[0]?.name.includes('Kira'), `nearest police station picked: ${r.rows[0]?.name}`);
r = await as(res, `select trigger_sos(0.3981, 32.6401, 8) id`);
ok(r.rows[0].id === alert, 'second press within 2 min reuses the same alert');
const path1 = `${alert}/audio-1.m4a`;
r = await as(res, `select can_upload_evidence($1) u, can_view_evidence($1) v`, [path1]);
ok(r.rows[0].u && r.rows[0].v, 'resident can upload and view own alert evidence');
r = await as(res2, `select can_upload_evidence($1) u, can_view_evidence($1) v`, [path1]);
ok(!r.rows[0].u && !r.rows[0].v, 'other resident can neither upload nor view');
r = await as(grd, `select can_upload_evidence($1) u, can_view_evidence($1) v`, [path1]);
ok(!r.rows[0].u && r.rows[0].v, 'guard can view but not upload');
r = await as(stranger, `select can_view_evidence($1) v`, [path1]);
ok(!r.rows[0].v, 'stranger cannot view evidence');
await expectErr(res, `select update_sos_status($1, 'resolved')`, [alert], 'resident cannot resolve (only cancel)');
await expectErr(stranger, `select update_sos_status($1, 'resolved')`, [alert], 'outsider cannot change an alert');
await as(grd, `select update_sos_status($1, 'acknowledged')`, [alert]);
r = await db.query(`select status, acknowledged_by from sos_alerts where id=$1`, [alert]);
ok(r.rows[0].status === 'acknowledged' && r.rows[0].acknowledged_by === grd, 'guard acknowledges');
r = await as(mgr, `select * from nearest_police_station(0.398, 32.64)`);
ok(r.rows.length === 1, 'nearest_police_station callable');
await db.exec(`update estates set subscription_status='suspended'`);
await expectErr(res, `select * from create_guest_pass($1, 'x', now() + interval '1 hour')`, [A1], 'suspended estate: passes blocked');
r = await as(res, `select trigger_sos(0.2, 32.5, 10) id`);
ok(!!r.rows[0].id, 'suspended estate: SOS still works');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
