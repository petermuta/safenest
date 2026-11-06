# SafeNest — Phase 1

Estate security and management for Uganda. One codebase with three parts:

| Part | What it is | Tech |
|---|---|---|
| `apps/mobile` | App for **residents** (SOS, guest passes) and **guards/managers** (gate check, visitor log, live alerts) | React Native, Expo SDK 58, TypeScript |
| `apps/web` | Dashboard for **estate managers/landlords** and the **super admin** | Next.js 16, Tailwind 4 |
| `packages/shared` | Types, colours, Uganda phone helpers used by both apps | TypeScript |
| `supabase/` | Database, security rules, storage, SMS + SOS server functions | Postgres, Supabase, Deno |

What's built in Phase 1: phone-number login (OTP by SMS), role-based access, estates/units/resident registration, one-time guest passes (6-digit code + QR) with guard verification and a visitor log, and the SOS flow (GPS + unit → guards, manager and nearest police station by push with SMS fallback, plus photo, video and silent audio evidence).

**Checked before hand-over:** all three TypeScript projects typecheck, the web dashboard builds, the mobile app bundles for Android, both server functions typecheck under Deno, and 41 database tests pass (`npm run test:db`) covering every role and the security rules.

---

## How it works (in one minute)

- **Login.** Everyone signs in with their phone number. Supabase creates a 6-digit code; our `send-sms-hook` function delivers it through Africa's Talking.
- **Roles.** A person's role comes from their *membership* in an estate: `manager`, `guard` or `resident`. The super admin is set once by hand. Managers register residents and guards by phone number **before** those people install the app — when they first sign in, the database links them to their estate and unit automatically.
- **Guest passes.** A resident creates a pass → gets a 6-digit code + QR + a shareable link (`/p/<token>`) that works on any phone, no app needed. The guard scans or types it; the database checks it's for this estate, active and in its time window, marks it used **in the same step** (so it can't be used twice), and writes the visitor log entry.
- **SOS.** Resident holds the button for 1.5 s → the app gets GPS (falls back to the estate pin) → database creates the alert and picks the nearest police station → `sos-dispatch` pushes guards/manager, SMSes anyone the push didn't reach, and SMSes the police station a Google Maps link. The app then records audio quietly in 30-second chunks (each uploaded as it finishes) and lets the resident add photo/video. Guards and the dashboard see it live. No internet? The app opens a pre-filled SMS to the estate's gate phone.
- **Security.** Every table has row-level security: residents see only their unit, guards/managers only their estate, signed-out visitors only the public pass page. Rules for passes, gate checks and SOS live in database functions, not in the apps, so they can't be bypassed.

---

## Step 1 — Install the tools (once)

You need:

- **Node.js 20+** — https://nodejs.org
- **Docker Desktop** — runs Supabase locally
- **Supabase CLI** — on Mac: `brew install supabase/tap/supabase` (or use `npx supabase` everywhere below)
- **Xcode** (Mac, for iPhone) and/or **Android Studio**
- An **Expo** account (free) — https://expo.dev
- An **Africa's Talking** account — https://account.africastalking.com (start in the sandbox)

## Step 2 — Install the project

```bash
cd safenest
npm install
```

*Why:* one install for all workspaces. The shared package is linked into both apps automatically.

## Step 3 — Start the database locally

```bash
npx supabase start          # first run downloads Docker images (a few minutes)
npx supabase db reset       # applies the 3 migrations + seed data
npm run test:db             # optional: 41 checks of every role and rule
npx supabase status         # prints API URL, anon key and Studio URL — keep this open
```

*What you get:* tables, security rules, the private `sos-evidence` storage bucket, and three **placeholder** police stations for testing.

**Test logins without SMS.** `supabase/config.toml` sets fixed codes for local testing — sign in with any of these and use code **123456**:

| Number to type | Use it as |
|---|---|
| 0700 000 100 | Estate manager |
| 0700 000 200 | Resident |
| 0700 000 300 | Guard |

## Step 4 — Connect Africa's Talking (real SMS)

1. In Africa's Talking, open the **sandbox** app and generate an API key.
2. `cp supabase/functions/.env.example supabase/functions/.env` and fill in `AT_USERNAME=sandbox`, `AT_API_KEY`.
3. Serve the functions:

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

4. To send real OTPs locally, uncomment the `[auth.hook.send_sms]` block in `supabase/config.toml`, put the same secret in `SEND_SMS_HOOK_SECRET`, then `npx supabase stop && npx supabase start`.

*Note:* the sandbox only delivers to the Africa's Talking simulator. Going live needs a live app, airtime/credit, and an approved sender ID (e.g. `SAFENEST`) — apply early, approval can take a while.

## Step 5 — Run the web dashboard

```bash
cp apps/web/.env.example apps/web/.env.local   # paste API URL + anon key from `supabase status`
npm run web                                     # http://localhost:3000
```

Then, as the manager (0700 000 100 / 123456):

1. **Register an estate** (use "Use my location" for the pin).
2. **Add units**: type `A1-A10, B1-B6` — ranges expand automatically.
3. **Add people**: resident 0700 000 200 → unit A1; guard 0700 000 300.
4. **Set the gate phone** (used for the no-internet SOS fallback).

**Make yourself super admin** (to manage police stations) in Studio's SQL editor:

```sql
update public.profiles set role = 'super_admin' where phone = '+2567XXXXXXXX';
```

## Step 6 — Run the mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Use your computer's LAN IP (not 127.0.0.1) so your phone can reach Supabase:
#   EXPO_PUBLIC_SUPABASE_URL=http://192.168.x.x:54321
#   EXPO_PUBLIC_WEB_URL=http://192.168.x.x:3000

cd apps/mobile
npx eas login
npx eas init                 # writes your projectId into app.json (needed for push)
npx expo run:ios             # iPhone plugged into your Mac — builds a development app
# or: npx expo run:android
```

*Why a development build and not Expo Go:* push notifications (how guards get SOS alerts) don't work in Expo Go. Everything else does, so `npm run mobile` + Expo Go is fine for a quick look at the screens.

**Try the full flow** with two phones (or phone + simulator):

1. Resident (0700 000 200) → **New guest pass** → Share. Open the shared link in a browser: it shows the QR and code.
2. Guard (0700 000 300) → **Gate** → scan the QR or type the code → green "VALID PASS". Scan again → red "already used". The entry appears in **Visitors** and on the web Visitor log.
3. Resident → **hold SOS** 1.5 s → the alert screen opens and starts recording audio. Add a photo.
4. Guard phone gets a push → **I'm responding**. The web **SOS alerts** page shows it live with the map link, who was notified, and the evidence.

## Step 7 — Go live

```bash
# 1. Create a project at supabase.com (choose the closest region), then:
npx supabase link --project-ref <your-ref>
npx supabase db push

# 2. Secrets for the functions (live Africa's Talking values):
npx supabase secrets set AT_USERNAME=<live-username> AT_API_KEY=<key> AT_SENDER_ID=SAFENEST \
  SEND_SMS_HOOK_SECRET='v1,whsec_...' DASHBOARD_URL=https://<your-dashboard>

# 3. Deploy the functions
npm run functions:deploy
```

In the Supabase dashboard:
- **Authentication → Sign In / Providers → Phone**: enable.
- **Authentication → Hooks → Send SMS hook**: type HTTPS, URL `https://<ref>.supabase.co/functions/v1/send-sms-hook`, generate the secret and put it in `SEND_SMS_HOOK_SECRET`.
- **Remove** the test phone numbers (they only exist in your local `config.toml`, but double-check).

Web: deploy `apps/web` to Vercel (root directory `apps/web`, add the two `NEXT_PUBLIC_` variables).
Mobile: `npx eas build --platform all --profile production`, then `npx eas submit`.

---

## Before real residents rely on SOS — please read

- **Police stations.** There is no public Uganda Police API. SafeNest SMSes the station numbers *you* load in **Police stations** (super admin). The seeded ones are fake placeholders. Verify each number with the station (ideally get a 24-hour line) and agree the process with the district police commander before launch. The app always offers **Call 999** too.
- **"Silent" audio.** The app plays no sounds and shows no prompts while recording, but iPhone and Android always show their microphone indicator — that can't and shouldn't be hidden. Recording is reliable while SafeNest is on screen; if the phone locks, the OS may pause it. Each 30-second chunk uploads as it finishes so earlier evidence is kept.
- **Privacy law.** You're storing phone numbers, locations, photos and audio. Uganda's Data Protection and Privacy Act, 2019 applies — register with the Personal Data Protection Office and have a privacy notice and consent screen before launch.
- **Evidence access.** Files are private. Only the resident and that estate's guards/manager can open them, through links that expire.
- **SMS cost.** Each SOS sends one SMS per staff member without push, plus one to police. Budget Africa's Talking credit per estate.

## Project map

```
supabase/migrations/   schema · security rules + RPCs · storage
supabase/functions/    send-sms-hook (OTP) · sos-dispatch (push + SMS)
supabase/tests/        database flow tests (npm run test:db)
apps/mobile/app/       (auth) login · resident/ · staff/ · pass/ · sos/[id]
apps/web/app/          login · (dash)/ overview, estates, visitors, sos, admin/police · p/[token] public pass
packages/shared/src/   types · theme colours · Uganda phone helpers
```

## Not in Phase 1 (planned)

Subscription billing with MTN MoMo / Airtel Money (the `subscription_status` field and `ugNetwork()` helper are ready for it), automatic SMS of the pass to the guest, rate limiting on code guessing, offline gate mode for guards, and Luganda/Swahili translations.
