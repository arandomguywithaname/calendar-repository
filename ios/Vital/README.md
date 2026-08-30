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
- `Sources/SettingsView.swift` — one-time setup: server URL + secret key, with a
  **Test connection** button. The key is stored in the phone's Keychain, never in code.
- `Sources/HealthKitReader.swift` — asks permission for each data type separately
  (sleep, heart rate, HRV, resting HR, respiration, SpO₂, VO₂max, energy, steps,
  workouts) and aggregates the last N days.
- `Sources/Uploader.swift` / `Payload.swift` — builds the exact JSON the server's
  `/api/health/ingest` expects (see `APPLE_HEALTH.md` §2b) and POSTs it.

## Turning this into a running app (dad's part)

You need a Mac with Xcode (or a CI Mac later). Two ways to get a project:

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
3. Signing & Capabilities → **+ Capability → HealthKit**.
4. Info tab → add **Privacy – Health Share Usage Description** with a sentence like
   the one in `project.yml`.

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
