# SafeNest — Phase 1

Estate security and management for Uganda, running entirely on **Netlify**.

| Part | What it is | Tech |
|---|---|---|
| `apps/web` | Web dashboard for estate managers and the super admin, **plus the API** both apps use | Next.js 16, Tailwind 4 |
| `apps/mobile` | App for residents (SOS, guest passes) and guards/managers (gate check, visitor log, alerts) | React Native, Expo SDK 58 |
| `apps/web/netlify/database` | Database migration and tests | Netlify Database (Postgres) |
| `packages/shared` | Types, colours, Uganda phone helpers | TypeScript |

**What's built:** phone-number login (SMS code via Africa's Talking), role-based access (super admin, estate manager, guard, resident), estates/units/resident registration, one-time guest passes (6-digit code + QR + shareable link) with guard verification and a visitor log, and SOS (GPS + unit → guards, manager and nearest police station by push with SMS fallback, plus photo, video and silent audio evidence).

**Checked before hand-over:**
- 46 database tests (`npm run test:db`).
- 55 end-to-end checks against the running app on a real Postgres server (`npm run test:e2e`). They cover every role, including what each role must *not* be able to do.
- All three projects typecheck, the web app builds, and the iPhone app bundles.
- Not yet tested on Netlify itself: the deploy is blocked from my side (see the end).

---

## How it works

- **One Netlify site does everything.** The web dashboard and the API live in the same Next.js app; Netlify turns the API routes into server functions. The mobile app talks to the same site.
- **Database.** Netlify Database (Postgres). The migration in `apps/web/netlify/database/migrations` is applied **automatically on every deploy**, so you never touch the database directly.
- **Login.** The API texts a 6-digit code through Africa's Talking. Only a hash of the code is stored, it expires in 10 minutes, and there's a limit of 3 codes per 10 minutes and 5 tries per code. Sessions last 30 days: an httpOnly cookie on the web, and secure phone storage in the app.
- **Who can do what.** Every request runs inside a database transaction tagged with the signed-in user. The rules ("only this estate's guards can verify a pass", "residents only see their unit"…) live in database functions, so neither app can bypass them.
- **Evidence.** Photos, videos and audio go into a private Netlify Blobs store. They're only served after the database confirms the viewer is the resident who raised the alert or that estate's staff. The app opens files through 10-minute links.
- **Live updates.** The dashboard checks for new SOS alerts every 5 seconds and beeps; the guard app checks every 5 seconds and vibrates. When the app is closed, guards get a push notification.

---

## Deploy to Netlify (from your phone)

### 1. Put the code on GitHub
Create an empty **private** repository called `safenest` on github.com (no README), and reconnect GitHub in Claude's settings so Claude can push. Or push it yourself from a computer:
```bash
cd safenest
git remote add origin https://github.com/<you>/safenest.git
git push -u origin main
```

### 2. Import it into Netlify
In Netlify: **Add new project → Import an existing project → GitHub → safenest**.
- **Base directory:** leave blank. **Package directory:** `apps/web` (Build settings → Configure). Without it the site shows "Page not found".
- **Build command / publish:** already set in `netlify.toml`, so leave the defaults.

### 3. Turn on the database
Netlify creates the database automatically on the first deploy, because `@netlify/database` is installed, and then applies the migration.

Netlify Database needs a **credit-based plan**. If the deploy says *"database feature not available for this account"*, that's the reason. You can also check under **Data & Storage → Database**.

### 4. Add environment variables
Go to **Project configuration → Environment variables** and add these with **Builds** and **Functions** scope:

| Name | Value |
|---|---|
| `SESSION_SECRET` | 32+ random characters (any password generator; keep it secret) |
| `AT_USERNAME` | `sandbox` while testing, your live username later |
| `AT_API_KEY` | from Africa's Talking |
| `AT_SENDER_ID` | approved sender ID (e.g. `SAFENEST`); leave empty until approved |
| `SUPER_ADMIN_PHONES` | your number, e.g. `+256772123456` (makes you super admin on sign-in) |

Then **Deploys → Trigger deploy**, because variable changes only apply after a new build. Open `https://<your-site>.netlify.app/api/health`. It should show `"ok": true` and `"sessionSecretSet": true`.

**Testing without SMS credit:** temporarily add `ALLOW_TEST_OTP=true` and `TEST_OTP_NUMBERS=+256700000100,+256700000200,+256700000300`. Also add `TEST_OTP_CODE`, a secret 6-digit code you choose (never `123456`), marked as a secret. Those numbers then sign in with that code and no SMS is sent. **Remove both before real people use it.**

### 5. Set up your estate (on the dashboard)
1. Sign in with your number.
2. Go to **Police stations** and add the real stations near your estates, with numbers you've verified.
3. **Register an estate**, add units (`A1-A10, B1-B6` expands automatically), and add residents and guards by phone number.
4. Set the **gate phone**. Residents' phones SMS it if they press SOS with no internet.

### 6. The mobile app
On a computer, when you have one:
```bash
cd safenest && npm install
cd apps/mobile
echo "EXPO_PUBLIC_API_URL=https://<your-site>.netlify.app" > .env
npx eas login
npx eas init                                            # sets the project id push needs
npx eas build --platform ios --profile development      # builds in Expo's cloud, installs on your iPhone
```
For the App Store: `npx eas build --platform all --profile production`, then `npx eas submit`.

---

---

## Run the mobile app on an iPhone from Windows

**Quick test with Expo Go (free; everything except push notifications)**
1. Install **Node.js 22 LTS** (nodejs.org) and **Git** (git-scm.com). On the iPhone, install **Expo Go** from the App Store.
2. In PowerShell:
   ```powershell
   git clone https://github.com/petermuta/safenest
   cd safenest
   npm install
   cd apps\mobile
   Set-Content .env "EXPO_PUBLIC_API_URL=https://peter-safenest.netlify.app"
   npx expo start --tunnel
   ```
3. Scan the QR code with the iPhone camera. It opens in Expo Go.

**Full app with push notifications (Expo cloud build; needs an Apple Developer account, $99/year)**
```powershell
npm install -g eas-cli
cd apps\mobile
eas login
eas init                                   # links the project and sets the push project id
eas device:create                          # register your iPhone (open the link on the phone)
eas build --profile development --platform ios
```
Install the build from the link Expo sends, then run `npx expo start --tunnel` and open it in the SafeNest app.

## Run locally (optional, needs a computer)
```bash
npm install
npm install -g netlify-cli
netlify link            # pick the site
netlify dev             # starts the app with a local Netlify Database and Blobs
netlify database migrations apply
```
Tests: `npm run test:db` needs nothing else. `npm run test:e2e -- http://localhost:8888` needs a fresh local database and the test settings shown in `scripts/e2e.mjs`.

---

## Before real residents rely on SOS — please read

- **Police stations.** There's no public Uganda Police API. SafeNest SMSes the station numbers you enter. Verify each one, ideally a 24-hour line, and agree the process with the district police before launch. The app always offers **Call 999** too.
- **"Silent" audio.** No sounds or prompts play, but iPhone and Android always show their microphone indicator, which can't and shouldn't be hidden. Recording is reliable while SafeNest is on screen. Each 30-second chunk uploads as it finishes.
- **Upload size.** Netlify functions accept about 6 MB per upload, so SOS videos are capped at 15 seconds in low quality. Photos and audio chunks are well under the limit.
- **Privacy law.** Uganda's Data Protection and Privacy Act, 2019 applies, since you're storing locations, photos and audio. Register with the Personal Data Protection Office and add a privacy notice before launch.
- **Costs.** Netlify Database and Functions use plan credits. Africa's Talking charges per SMS: each SOS sends one SMS per staff member without push, plus one to the police.

---

## Phase 1b — police portal, resident identity, community alerts

**Police portal** (`/police` on the website, works on phones)
- Police units form a chain: **post → regional HQ → headquarters** (super admin: *Police units*).
- Each officer is registered by phone number (*Police officers*) and signs in with their own SMS code. Roles:
  - **Dispatcher**, at a post: sees every SOS routed to the post, dispatches on-duty officers, escalates to regional.
  - **Officer**, at a post: signs on/off duty; sees only cases assigned to them, with a map, distance, an estimated travel time and a **Get directions** button; reports *en route → on scene → closed*.
  - **Commander**, at a regional HQ or headquarters: sees cases escalated to them; regional commanders escalate to headquarters.
- SOS alerts route to the nearest active **post** only.
- **Audit log:** every case opened, dispatch, escalation, status change, NIN reveal, NIN search (with its stated reason) and photo view is recorded with the officer's name.

**Resident identity** (mobile onboarding)
- Residents must add their **NIN** (with explicit consent) and a **live selfie** taken with the front camera before using the app. The SOS button is available throughout onboarding.
- The NIN is encrypted (AES-256-GCM) with `NIN_ENCRYPTION_KEY`. Estate managers see only `••••••••••ABCD`. Police can reveal it on a case, or search by exact NIN with a reason; both are logged.
- The selfie is private: the resident, police on that resident's case, or police who searched them in the last hour (logged).

**Community alerts** (mobile *Neighbours* tab; managers moderate on the website)
- Residents post suspicious activity with a category, description, optional photo and location. Neighbours whose estate is within **1 km** get a push notification.
- Neighbours can react with *I see it too* or *All clear*, or report a post. 3 reports hide it until a manager reviews; managers of nearby estates can remove or restore posts.
- **Police never see the feed.** *Send to police* turns a post into an SOS from the person who tapped it, with the description and photo attached as evidence. It only ever creates one SOS per post.

**Extra environment variable:** `NIN_ENCRYPTION_KEY`, 32+ random characters, stored as a secret. **Never change it** after residents register, and keep a backup somewhere safe.

**Setting it up:** in the dashboard, go to *Police units* and add headquarters, then regional HQs, then posts, each pointing to the one above. Then go to *Police officers* and add dispatchers and officers at posts and commanders at HQs. Officers sign in at the same website and land in the police portal.

**Before real use:**
- Get written agreement from Uganda Police on which units and officers use the portal.
- Register SafeNest with the Personal Data Protection Office, since you now hold NINs and photos.
- Keep `NIN_ENCRYPTION_KEY` backed up offline.

## Project map
```
apps/web/netlify/database/migrations/   the whole schema, rules and functions (applied on deploy)
apps/web/netlify/database/tests/        database tests + test-only seed data
apps/web/app/api/              the API: auth, estates, passes, gate, visitors, sos, evidence, admin
apps/web/lib/server/           db transactions, sessions, OTP, SMS, SOS dispatch, evidence storage
apps/web/app/(dash)/           dashboard pages · app/p/[token] public guest pass · app/login
apps/mobile/app/               (auth) · resident/ · staff/ · pass/ · sos/[id]
scripts/e2e.mjs                end-to-end API checks
```

## Not in Phase 1
Subscription billing with MTN MoMo / Airtel Money (the `subscription_status` field and `ugNetwork()` helper are ready), texting the pass to the guest automatically, offline gate mode for guards, and Luganda/Swahili translations.
