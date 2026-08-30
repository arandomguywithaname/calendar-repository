# Vital — the iPhone app

*(Named by Tim, product owner.)*

Vital is the left square of the project diagram: it reads Apple Health **on the phone**
(Apple Health never uploads anything by itself), and sends the data to **our own server**
— the one in this repository — using the secret key. Claude answers questions from there.

```
[ iPhone: Vital reads Health ] → [ our server: stores ] → [ Claude: answers ]
```

What's in the box:

- `Sources/ContentView.swift` — the main screen, built to Tim's spec: last sent time,
  success or error, and one big **Send now** button (plus a 7/30/90-day picker — use
  90 once at the start to seed history).
- **Automatic updates:** the app re-sends by itself every time it's opened (if the last
  send is 4+ hours old), and registers an iOS background-refresh task that sends between
  opens. Background timing is decided by iOS (best-effort, typically a few times a day) —
  opening the app is the guaranteed refresh. `Sources/SyncEngine.swift` is the one place
  all three triggers (button, open, background) go through.
- `Sources/SettingsView.swift` — one-time setup: server URL + secret key, with a
  **Test connection** button. The key is stored in the phone's Keychain, never in code.
- `Sources/HealthKitReader.swift` — asks permission for each data type separately
  (sleep, heart rate, HRV, resting HR, respiration, SpO₂, VO₂max, energy, steps,
  workouts) and aggregates the last N days.
- `Sources/Uploader.swift` / `Payload.swift` — builds the exact JSON the server's
  `/api/health/ingest` expects (see `APPLE_HEALTH.md` §2b) and POSTs it.

## Building WITHOUT a Mac or Xcode (recommended — browser only)

The repository has a robot builder: `.github/workflows/build-vital.yml` rents a Mac
from GitHub, builds Vital, signs it, and uploads it to TestFlight. Dad's one-time
setup, entirely in a web browser:

1. **Apple Developer Program** approved ($99/year — already applied for per the plan).
2. **developer.apple.com → Identifiers → +** → App ID for Vital (e.g.
   `com.yourfamily.vital`) with the **HealthKit** capability ticked. Put the same
   value into `bundleIdPrefix` in `ios/Vital/project.yml` (editable on GitHub with
   the pencil button — use `com.yourfamily`, the `.vital` part is added by the
   project name... i.e. prefix `com.yourfamily` → app id `com.yourfamily.Vital`).
3. **appstoreconnect.apple.com → My Apps → +** → New App, name `Vital`, that bundle id.
4. **App Store Connect → Users and Access → Integrations → App Store Connect API** →
   create a key with the **App Manager/Admin** role; note the Key ID and Issuer ID and
   download the `.p8` file.
5. **GitHub repo → Settings → Secrets and variables → Actions**:
   - Secrets: `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY` (the
     full text of the `.p8` file), `APPLE_TEAM_ID` (from the developer.apple.com
     membership page), and `VITAL_CONNECTION_LINK` (a personal link from
     `npm run user` — as a secret so it stays out of the public repo).
   - Variables: `VITAL_CI_ENABLED` = `true` (the workflow stays off until this).
6. Push anything touching `ios/` (or press **Actions → Build Vital → Run workflow**
   once available). ~15 minutes later the build appears in **TestFlight**, where you
   invite family members by email as internal testers — installs are one tap, and the
   baked-in connection link means zero setup on the phone.

Expect the very first CI run to need a fix or two (nobody has compiled this Swift
yet) — paste the red log to Claude.

## Robot builder option B — Codemagic (friendlier buttons, same idea)

[Codemagic](https://codemagic.io) is a build service with a big "Start new build"
button; the recipe (`codemagic.yaml` in the repo root) is already written. Browser-only
setup — same Apple prerequisites as above (Developer account, App ID with HealthKit,
app record in App Store Connect, App Store Connect API key):

1. **codemagic.io → Sign up with GitHub**, authorize it.
2. **Add application** → pick this repository → it finds `codemagic.yaml` by itself.
3. **Team → Integrations → Developer Portal → App Store Connect**: add your API key
   (Key ID, Issuer ID, the `.p8` file) and name it exactly `vital-asc-key`.
4. **Team → Environment variables**: create a group `appstore_credentials` with
   `CERTIFICATE_PRIVATE_KEY` — an RSA key Codemagic uses to create signing
   certificates. Generate one on any computer with Node:
   `node -e "console.log(require('crypto').generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey)"`
   Optionally add `VITAL_CONNECTION_LINK` (family zero-config build) or
   `VITAL_SERVER_URL` (customer build with the in-app Join button) to the same group,
   marked secret.
5. Edit `BUNDLE_ID` in `codemagic.yaml` to your registered App ID (GitHub pencil button).
6. **Start new build** → pick the branch and the `Vital → TestFlight` workflow. The
   build lands in TestFlight, where you invite testers by email.

Codemagic's free tier includes 500 macOS build minutes/month — plenty for this app.
Use either robot builder; they produce the same result.

## Building WITH a Mac (alternative)

Two ways to get a project:

**Way A — XcodeGen (clean):**

```bash
brew install xcodegen
cd ios/Vital
xcodegen generate     # → Vital.xcodeproj
open Vital.xcodeproj
```

Then in Xcode: set your Team under Signing & Capabilities, and change the bundle id
prefix (`com.CHANGEME.family`) in `project.yml` (regenerate) or in the project settings.

**Way B — by hand:**

1. Xcode → New Project → iOS App, name `Vital`, interface SwiftUI, language Swift.
2. Delete the generated `ContentView.swift`/`VitalApp.swift`; drag everything from
   `Sources/` into the project.
3. Signing & Capabilities → **+ Capability → HealthKit**, and **+ Capability →
   Background Modes** with **Background fetch** checked.
4. Info tab → add **Privacy – Health Share Usage Description** with a sentence like
   the one in `project.yml`, and **BGTaskSchedulerPermittedIdentifiers** (array) with
   one item: `app.vital.refresh`.

Run on a simulator first (the Health app on a simulator can hold test data), then on
the real phones: dad's via TestFlight, Tim's via the ad-hoc "secret link" (his UDID
goes into the provisioning profile) — exactly as the project plan says.

## First run on a phone

The zero-config way: before building, paste the **connection link** (printed by
`npm run link` on the computer) into `VitalDefaultConnectionLink` in `project.yml`
(or the Info tab in Xcode). Then anyone who installs the app just:

1. Opens Vital, presses **Send now**, and approves the Health permissions they're
   happy to share (pick **90 days** the first time to seed history).
2. Done — the server's `/health` page shows the data arriving, and Claude can
   answer questions about it immediately.

No baked-in link? Then it's one extra step: gear button → paste the connection
link → **Test connection** → Save.

## Honesty note from the robot programmer

This code was written on a Linux machine with no Xcode, so it has never been compiled.
The APIs used are standard (SwiftUI, HealthKit query descriptors, iOS 16+), but expect
the first build to surface a few small errors — paste them to Claude and they'll be
fixed in minutes. That's a normal day in engineering.
