// End-to-end check of the SafeNest API over HTTP.
//
//   node scripts/e2e.mjs http://localhost:3000
//
// Needs a running app with ALLOW_TEST_OTP=true, TEST_OTP_NUMBERS containing every test
// number below (+2567000001/2/3/4/5/6/7/800 and 999 series), SUPER_ADMIN_PHONES=+256700000100,
// NIN_ENCRYPTION_KEY set, and a fresh database with the test police stations seeded.
// Never point this at the live site.

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const TEST_CODE = process.env.TEST_OTP_CODE ?? '';
if (!/^\d{6}$/.test(TEST_CODE)) { console.error('Set TEST_OTP_CODE (same as the server)'); process.exit(1); }
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
  const r = await call('/api/auth/verify', { body: { phone, code: TEST_CODE } });
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

console.log('\nResident identity (NIN + selfie)');
r = await call('/api/me/identity', { token: res.token, body: { full_name: 'Grace Achieng', nin: 'CM12345678ABCD' } });
ok(r.status === 400, 'NIN refused without consent');
r = await call('/api/me/identity', { token: res.token, body: { full_name: 'Grace Achieng', nin: '12345', consent: true } });
ok(r.status === 400, 'malformed NIN refused');
r = await call('/api/me/identity', { token: res.token, body: { full_name: 'Grace Achieng', nin: 'cm 1234 5678 abcd', consent: true } });
ok(r.status === 200 && r.data.nin_masked === '••••••••••ABCD', `NIN saved and masked (${r.data.nin_masked})`);
r = await call('/api/me/identity', { token: res2.token, body: { full_name: 'Copy Cat', nin: 'CM12345678ABCD', consent: true } });
ok(r.status === 409, 'same NIN cannot be registered to a second account');
const selfie = () => { const f = new FormData(); f.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 0xff, 0xd9])], { type: 'image/jpeg' }), 's.jpg'); return f; };
r = await call('/api/me/selfie', { token: res.token, form: selfie() });
ok(r.status === 201, 'live selfie uploaded');
r = await call('/api/me', { token: res.token });
ok(r.data.identity.has_nin && r.data.identity.has_selfie, 'onboarding complete for the resident');
r = await call(`/api/estates/${estate}`, { token: mgr.token });
const grace = r.data.members.find((m) => m.profile.phone === '+256700000200');
ok(grace?.nin_masked === '••••••••••ABCD' && grace.has_selfie && !JSON.stringify(r.data).includes('CM12345678'), 'manager sees only the masked NIN');
const meRes = (await call('/api/me', { token: res.token })).data.profile.id;
r = await call(`/api/identity/${meRes}/selfie`, { token: res2.token });
ok(r.status === 403, "other residents can't see someone's photo");

console.log('\nPolice chain of command');
const unit = async (body) => (await call('/api/admin/police', { token: mgr.token, body })).data;
const hqU = await unit({ name: 'TEST National HQ', level: 'headquarters', phone: '+256700000020', lat: 0.31, lng: 32.58 });
const regU = await unit({ name: 'TEST Kampala North Region', level: 'regional', parent_id: hqU.id, phone: '+256700000021', lat: 0.35, lng: 32.6 });
r = await call('/api/admin/police', { token: mgr.token, body: { name: 'Bad post', level: 'post', parent_id: hqU.id, phone: '+256700000022', lat: 0.4, lng: 32.6 } });
ok(r.status === 400, 'a post cannot report straight to headquarters');
const postU = await unit({ name: 'TEST Kira Gardens Post', level: 'post', parent_id: regU.id, phone: '+256700000023', lat: 0.4005, lng: 32.6402 });
ok(!!postU.id, 'headquarters → regional → post created');
r = await call('/api/admin/police', { token: grd.token });
ok(r.status === 403, 'only the super admin manages police units');

const addOfficer = (station_id, phone, full_name, role) => call('/api/admin/officers', { token: mgr.token, body: { station_id, phone, full_name, role, badge_no: `UPF-${phone.slice(-3)}` } });
r = await addOfficer(postU.id, '0700000500', 'Sgt. Okello', 'commander');
ok(r.status === 400, 'posts take officers and dispatchers, not commanders');
await addOfficer(postU.id, '0700000500', 'Sgt. Okello Dispatch', 'dispatcher');
await addOfficer(postU.id, '0700000600', 'PC Nansubuga', 'officer');
await addOfficer(regU.id, '0700000700', 'ASP Mugisha', 'commander');
await addOfficer(hqU.id, '0700000800', 'SP Atim', 'commander');
const disp = await signIn('+256700000500');
const offc = await signIn('+256700000600');
const regc = await signIn('+256700000700');
const hqc = await signIn('+256700000800');
r = await call('/api/police/me', { token: disp.token });
ok(r.data.role === 'dispatcher' && r.data.station.name === 'TEST Kira Gardens Post', 'officers are linked to their own login on first sign-in');
r = await call('/api/police/alerts', { token: res.token });
ok(r.status === 403, 'residents cannot open the police portal');

r = await call('/api/sos', { token: res.token, body: { lat: 0.4001, lng: 32.6401, accuracy: 9, estate_id: estate } });
const sos2 = r.data.alert_id;
ok(r.data.dispatch?.police?.name === 'TEST Kira Gardens Post', `new SOS routed to the nearest post (${r.data.dispatch?.police?.name})`);
const listed = async (who) => (await call('/api/police/alerts', { token: who.token })).data.some?.((a) => a.id === sos2) ?? false;
ok(await listed(disp), 'dispatcher sees the new case');
ok(!(await listed(offc)) && !(await listed(regc)) && !(await listed(hqc)), 'officer, regional and HQ do not see it yet');

r = await call(`/api/police/alerts/${sos2}`, { token: disp.token });
ok(r.data.alert.resident.nin_masked === '••••••••••ABCD' && r.data.alert.resident.has_selfie && !JSON.stringify(r.data).includes('CM12345678'),
  'case shows the resident, photo flag and masked NIN only');
ok(r.data.can.assign && r.data.can.escalate, 'dispatcher can assign and escalate');
r = await call(`/api/identity/${meRes}/selfie?alert=${sos2}`, { token: disp.token });
ok(r.status === 200, "dispatcher can see the resident's photo on the case");
r = await call(`/api/police/alerts/${sos2}/nin`, { token: disp.token, method: 'POST' });
ok(r.data.nin === 'CM12345678ABCD', 'full NIN revealed to police on request (logged)');

const officers = (await call('/api/police/officers', { token: disp.token })).data;
const pc = officers.find((o) => o.full_name === 'PC Nansubuga');
r = await call(`/api/police/alerts/${sos2}/assign`, { token: disp.token, body: { officer_id: pc.id } });
ok(r.status === 400, 'cannot dispatch an officer who is off duty');
await call('/api/police/duty', { token: offc.token, body: { on_duty: true } });
r = await call(`/api/police/alerts/${sos2}/assign`, { token: disp.token, body: { officer_id: pc.id } });
ok(r.status === 200, 'dispatcher assigns the on-duty officer');
ok(await listed(offc), 'assigned officer now sees the case');
r = await call(`/api/police/alerts/${sos2}`, { token: offc.token });
ok(r.data.can.status && !r.data.can.assign && !r.data.can.escalate && typeof r.data.alert.lat === 'number', 'officer gets the GPS pin and can update progress only');
r = await call(`/api/police/alerts/${sos2}/status`, { token: offc.token, body: { status: 'en_route' } });
ok(r.status === 200, 'officer marks en route');
r = await call(`/api/sos/${sos2}`, { token: res.token });
ok(r.data.status === 'acknowledged', 'resident sees help is responding');

r = await call(`/api/police/alerts/${sos2}/escalate`, { token: offc.token, method: 'POST' });
ok(r.status === 400, 'officer cannot escalate');
r = await call(`/api/police/alerts/${sos2}/escalate`, { token: disp.token, method: 'POST' });
ok(r.data.level === 'regional' && (await listed(regc)) && !(await listed(hqc)), 'post escalates to regional HQ (HQ still cannot see it)');
r = await call(`/api/police/alerts/${sos2}/escalate`, { token: regc.token, method: 'POST' });
ok(r.data.level === 'headquarters' && (await listed(hqc)), 'regional escalates to headquarters');

r = await call('/api/police/search', { token: hqc.token, body: { nin: 'CM12345678ABCD' } });
ok(r.status === 400, 'NIN search needs a reason');
r = await call('/api/police/search', { token: hqc.token, body: { nin: 'CM12345678ABCD', reason: 'Identity check on escalated case' } });
ok(r.data.found && r.data.person.full_name === 'Grace Achieng' && r.data.homes[0]?.unit === 'A1', 'HQ finds the resident by exact NIN');
r = await call(`/api/identity/${meRes}/selfie`, { token: hqc.token });
ok(r.status === 200, 'photo viewable after a logged search');
r = await call('/api/police/search', { token: res.token, body: { nin: 'CM12345678ABCD', reason: 'curious neighbour' } });
ok(r.status === 403, 'residents cannot search by NIN');

r = await call(`/api/police/alerts/${sos2}/status`, { token: offc.token, body: { status: 'closed' } });
ok(r.status === 200, 'officer closes the case');
r = await call('/api/police/audit', { token: hqc.token });
const actions = new Set(r.data.map((x) => x.action));
ok(['escalate', 'nin_search', 'view_selfie'].every((a) => actions.has(a)), `HQ audit log shows actions in its chain (${[...actions].join(', ')})`);
r = await call('/api/police/audit', { token: disp.token });
ok(['view_alert', 'reveal_nin', 'assign', 'escalate'].every((a) => r.data.some((x) => x.action === a)), 'post audit log records opens, NIN reveals, dispatch and escalation');

console.log('\nCommunity alerts');
const cform = (lat, lng, withPhoto) => {
  const f = new FormData();
  f.append('category', 'suspicious_person'); f.append('message', 'Two men checking car doors near the gate');
  f.append('lat', String(lat)); f.append('lng', String(lng));
  if (withPhoto) f.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 0xff, 0xd9])], { type: 'image/jpeg' }), 'p.jpg');
  return f;
};
r = await call('/api/community', { token: res.token, form: cform(0.4003, 32.6403, true) });
ok(r.status === 201, 'resident posts a community alert with a photo');
const ca = r.data.id;
r = await call('/api/community?lat=0.4&lng=32.64', { token: res2.token });
const seen = r.data.alerts?.find((a) => a.id === ca);
ok(!!seen && seen.distance_km < 1 && seen.has_photo, `neighbour within 1 km sees it (${seen?.distance_km} km)`);
r = await call('/api/community?lat=0.42&lng=32.64', { token: res2.token });
ok(!r.data.alerts.some((a) => a.id === ca), 'someone ~2 km away does not');
r = await call('/api/community', { token: stranger.token });
ok(r.status === 403, 'people without an estate cannot see the feed');
r = await call('/api/community', { token: disp.token });
ok(r.status === 403, 'police cannot see community alerts');
r = await call(`/api/community/${ca}/photo`, { token: res2.token });
ok(r.status === 200, 'neighbour can view the photo');
r = await call(`/api/community/${ca}/react`, { token: res2.token, body: { kind: 'see_it_too' } });
r = await call('/api/community?lat=0.4&lng=32.64', { token: grd.token });
ok(r.data.alerts.find((a) => a.id === ca)?.see_it_too === 1, '"I see it too" counted');
r = await call(`/api/community/${ca}/report`, { token: res.token, body: {} });
ok(r.status === 400, "you can't report your own post");
r = await call(`/api/community/${ca}/remove`, { token: res2.token, body: { status: 'removed' } });
ok(r.status === 403, 'residents cannot remove posts');

r = await call(`/api/community/${ca}/send-to-police`, { token: res2.token, method: 'POST' });
const fromCommunity = r.data.alert_id;
ok(r.status === 201 && !!fromCommunity, 'neighbour taps "Send to police" → SOS created');
r = await call(`/api/police/alerts/${fromCommunity}`, { token: disp.token });
ok(r.data.alert?.source === 'community' && r.data.alert.note?.includes('checking car doors') && r.data.alert.evidence.length === 1,
  'police get the description and the photo as evidence');
r = await call(`/api/community/${ca}/send-to-police`, { token: grd.token, method: 'POST' });
ok(r.data.already_sent && r.data.alert_id === fromCommunity, 'sending twice does not create a second SOS');

r = await call(`/api/community/${ca}/remove`, { token: mgr.token, body: { status: 'removed' } });
ok(r.status === 200, 'estate manager removes the post');
r = await call('/api/community?lat=0.4&lng=32.64', { token: res2.token });
ok(!r.data.alerts.some((a) => a.id === ca), 'removed post disappears for residents');
r = await call('/api/community?lat=0.4&lng=32.64', { token: mgr.token });
ok(r.data.alerts.find((a) => a.id === ca)?.status === 'removed', 'manager still sees it (marked removed)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
