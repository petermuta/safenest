// End-to-end check of the SafeNest API over HTTP.
//
//   node scripts/e2e.mjs http://localhost:3000
//
// Needs a running app with ALLOW_TEST_OTP=true, TEST_OTP_NUMBERS containing the five
// numbers below, SUPER_ADMIN_PHONES=+256700000100, and a fresh database.
// Never point this at the live site.

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

async function call(path, { token, method, body, form, cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: method ?? (body !== undefined || form ? 'POST' : 'GET'),
    headers, redirect: 'manual',
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : type.includes('text') ? await res.text() : await res.arrayBuffer();
  return { status: res.status, data, res };
}

async function signIn(phone) {
  await call('/api/auth/otp', { body: { phone } });
  const r = await call('/api/auth/verify', { body: { phone, code: '123456' } });
  return { token: r.data.token, cookie: r.res.headers.get('set-cookie')?.split(';')[0] };
}

console.log('\nLogin');
let r = await call('/api/auth/otp', { body: { phone: '0772' } });
ok(r.status === 400, 'rejects a bad phone number');
await call('/api/auth/otp', { body: { phone: '0700 000 400' } });
r = await call('/api/auth/verify', { body: { phone: '0700000400', code: '000000' } });
ok(r.status === 400, `wrong code rejected → "${r.data.error}"`);
r = await call('/api/me');
ok(r.status === 401, 'no session → 401');
r = await call('/api/me', { token: 'not-a-real-token' });
ok(r.status === 401, 'forged token → 401');

const mgr = await signIn('+256700000100');
ok(!!mgr.token && !!mgr.cookie, 'manager signs in (token for app + cookie for web)');
r = await call('/api/me', { token: mgr.token });
ok(r.data.profile.role === 'super_admin', 'SUPER_ADMIN_PHONES makes the manager super admin');

console.log('\nEstate setup');
r = await call('/api/estates', { token: mgr.token, body: { name: 'Kira Gardens', district: 'Wakiso', lat: 0.4, lng: 32.64 } });
ok(r.status === 201, 'manager registers an estate');
const estate = r.data.id;
r = await call(`/api/estates/${estate}/units`, { token: mgr.token, body: { labels: ['A1', 'A2', 'A3', 'A1'] } });
ok(r.status === 201 && r.data.length === 3, 'adds units (duplicates skipped)');
const units = Object.fromEntries(r.data.map((u) => [u.label, u.id]));
r = await call(`/api/estates/${estate}/members`, { token: mgr.token, body: { phone: '0700000200', full_name: 'Grace Resident', role: 'resident', unit_id: units.A1 } });
ok(r.data.status === 'invited', 'resident registered by phone before signing up');
r = await call(`/api/estates/${estate}/members`, { token: mgr.token, body: { phone: '0700000300', full_name: 'Sam Guard', role: 'guard' } });
ok(r.data.status === 'invited', 'guard registered');
r = await call(`/api/estates/${estate}`, { token: mgr.token, method: 'PATCH', body: { gate_phone: '0772 000 111' } });
ok(r.data.gate_phone === '+256772000111', 'gate phone saved and normalised');

const res = await signIn('+256700000200');
const grd = await signIn('+256700000300');
const res2 = await signIn('+256700000400');
const stranger = await signIn('+256700000999');
r = await call(`/api/estates/${estate}/members`, { token: mgr.token, body: { phone: '0700000400', full_name: 'Other Resident', role: 'resident', unit_id: units.A2 } });
ok(r.data.status === 'added', 'existing user added straight away');

r = await call('/api/me', { token: res.token });
ok(r.data.memberships[0]?.role === 'resident' && r.data.memberships[0]?.unit?.label === 'A1', 'resident linked to Unit A1 on first sign-in');
r = await call('/api/me', { token: grd.token });
ok(r.data.memberships[0]?.role === 'guard', 'guard linked to the estate');
r = await call(`/api/estates/${estate}`, { token: stranger.token });
ok(r.status === 403, 'outsider cannot open the estate');
r = await call(`/api/estates/${estate}`, { token: grd.token });
ok(r.status === 200 && !r.data.members, "guard sees units but not the members list");
r = await call(`/api/estates/${estate}`, { token: grd.token, method: 'PATCH', body: { name: 'Hacked' } });
ok(r.status === 403, 'guard cannot edit the estate');
r = await call(`/api/estates/${estate}/members`, { token: res.token, body: { phone: '0700000555', full_name: 'x', role: 'guard' } });
ok(r.status === 400, `resident cannot add people → "${r.data.error}"`);
r = await call(`/api/estates/${estate}/overview`, { token: grd.token });
ok(r.status === 200 && r.data.units === 3 && r.data.residents === 2, 'staff overview counts');
r = await call(`/api/estates/${estate}/overview`, { token: res.token });
ok(r.status === 403, 'residents cannot see the overview');

console.log('\nGuest passes');
r = await call('/api/passes', { token: res.token, body: { unit_id: units.A1, guest_name: 'Sarah Guest', vehicle_plate: 'uba 123x', valid_until: new Date(Date.now() + 6 * 3600e3).toISOString() } });
ok(r.status === 201 && /^\d{6}$/.test(r.data.code), `resident creates a pass (code ${r.data.code})`);
const p1 = r.data;
r = await call('/api/passes', { token: res.token, body: { unit_id: units.A2, guest_name: 'x', valid_until: new Date(Date.now() + 3600e3).toISOString() } });
ok(r.status === 400, 'cannot create a pass for another unit');
r = await call(`/api/passes?unit_id=${units.A1}`, { token: res2.token });
ok(r.status === 403, "other resident cannot list A1's passes");
r = await call(`/api/passes/${p1.id}`, { token: res2.token });
ok(r.status === 404, "other resident cannot open the pass");
r = await call(`/api/passes?unit_id=${units.A1}`, { token: grd.token });
ok(r.status === 200 && r.data.length === 1, 'guard can list passes');

r = await call('/api/gate/verify', { token: res.token, body: { estate_id: estate, input: p1.code } });
ok(r.status === 400, 'resident cannot verify at the gate');
r = await call('/api/gate/verify', { token: stranger.token, body: { estate_id: estate, input: p1.code } });
ok(r.status === 400, 'outsider cannot verify at the gate');
r = await call('/api/gate/verify', { token: grd.token, body: { estate_id: estate, input: p1.code } });
ok(r.data.ok === true && r.data.unit_label === 'A1' && r.data.vehicle_plate === 'UBA 123X', 'guard admits by code');
r = await call('/api/gate/verify', { token: grd.token, body: { estate_id: estate, input: p1.code } });
ok(r.data.ok === false, 'same code refused the second time');
r = await call('/api/gate/verify', { token: grd.token, body: { estate_id: estate, input: p1.qr_token } });
ok(r.data.reason === 'already_used', 'QR of used pass → already used');

r = await call(`/p/${p1.qr_token}`);
ok(r.status === 200 && String(r.data).includes('Sarah Guest') && String(r.data).includes('Kira Gardens'), 'public pass page opens without signing in');
r = await call('/p/00000000-0000-4000-8000-000000000000');
ok(String(r.data).includes('Pass not found'), 'unknown pass link shows "not found"');

console.log('\nVisitor log');
r = await call(`/api/estates/${estate}/visitors`, { token: grd.token, body: { guest_name: 'Boda delivery', unit_id: units.A2 } });
ok(r.status === 201, 'guard logs a walk-in');
r = await call(`/api/visitors/${r.data.id}/exit`, { token: grd.token, method: 'POST' });
ok(r.status === 200, 'guard checks them out');
r = await call(`/api/estates/${estate}/visitors?days=1`, { token: grd.token });
ok(r.data.length === 2, 'guard sees every visit');
r = await call(`/api/estates/${estate}/visitors?days=1`, { token: res.token });
ok(r.data.length === 1 && r.data[0].guest_name === 'Sarah Guest', "resident sees only their unit's visitors");

console.log('\nSOS');
r = await call('/api/sos', { token: res.token, body: { lat: 0.398, lng: 32.64, accuracy: 12, estate_id: estate } });
ok(r.status === 201 && r.data.dispatch?.status === 'dispatched', 'resident raises SOS; dispatch runs');
const alert = r.data.alert_id;
ok(r.data.dispatch?.police?.name?.includes('Kira'), `nearest police station: ${r.data.dispatch?.police?.name}`);
r = await call('/api/sos', { token: stranger.token, body: { lat: 0.3, lng: 32.6 } });
ok(r.status === 400, 'someone with no estate cannot raise SOS');
r = await call(`/api/estates/${estate}/sos`, { token: grd.token });
const row = r.data.find((a) => a.id === alert);
ok(!!row && row.notifications.length >= 2, `guard sees it with ${row?.notifications.length} notification attempts logged`);
r = await call(`/api/sos/${alert}`, { token: res2.token });
ok(r.status === 404, "other residents can't see it");

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])], { type: 'image/jpeg' });
const form = () => { const f = new FormData(); f.append('kind', 'photo'); f.append('file', jpeg, 'photo.jpg'); return f; };
r = await call(`/api/sos/${alert}/evidence`, { token: res.token, form: form() });
ok(r.status === 201, 'resident uploads a photo');
const evId = r.data.id;
r = await call(`/api/sos/${alert}/evidence`, { token: res2.token, form: form() });
ok(r.status === 403, "others can't add evidence");
r = await call(`/api/evidence/${evId}`, { token: grd.token });
ok(r.status === 200 && r.data.byteLength === 10, 'guard downloads the photo');
r = await call(`/api/evidence/${evId}`, { token: stranger.token });
ok(r.status === 403, "outsider can't download it");
r = await call(`/api/evidence/${evId}/link`, { token: res.token, method: 'POST' });
const link = r.data.url;
r = await call(link);
ok(r.status === 200, '10-minute link opens without a session');
r = await call(link.replace(/t=.{6}/, 't=xxxxxx'));
ok(r.status === 401, 'tampered link refused');
r = await call(`/api/evidence/${evId}`, { cookie: mgr.cookie });
ok(r.status === 200, 'dashboard (cookie) can view evidence');

r = await call(`/api/sos/${alert}/status`, { token: res.token, body: { status: 'resolved' } });
ok(r.status === 400, 'resident cannot mark resolved');
r = await call(`/api/sos/${alert}/status`, { token: grd.token, body: { status: 'acknowledged' } });
ok(r.status === 200, 'guard acknowledges');
r = await call(`/api/sos/${alert}`, { token: res.token });
ok(r.data.status === 'acknowledged' && r.data.evidence.length === 1, 'resident sees "help is responding" and their evidence');

console.log('\nAdmin + web session');
r = await call('/api/admin/police', { token: mgr.token });
ok(r.status === 200 && r.data.length === 3, 'super admin lists police stations');
r = await call('/api/admin/police', { token: grd.token });
ok(r.status === 403, 'guard cannot manage police stations');
r = await call('/', { cookie: mgr.cookie });
ok(r.status === 200 && String(r.data).includes('SafeNest'), 'dashboard loads with the session cookie');
r = await call('/');
ok(r.status === 307 && r.res.headers.get('location')?.endsWith('/login'), 'signed-out visitor is sent to /login');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
