# Warden's Keep — Release Plan (App Store + Google Play, 2026)

> **Decision document** answering: "what needs to be done for us to make this
> available to anybody who wants it?" Verified against current (2025–2026)
> Apple/Google requirements — several changed recently; do not substitute
> pre-2025 advice. Sources and details: research pass of July 2026 (Apple/Google
> official docs verified live).

## Verdict on our stack (settle any doubt)

A Capacitor-wrapped Phaser game with real gameplay **passes App Store review
routinely**. Guideline 4.2 ("minimum functionality") targets repackaged
websites, not games; guideline 4.7 governs software *not embedded in the
binary* (mini-app platforms, streaming) and **does not apply to us** — our
bundle ships inside the IPA. Precedent: Vampire Survivors shipped its
chart-topping mobile release on Phaser + Capacitor; Phaser's official mobile
tutorial uses Capacitor. Mitigations we already satisfy: everything bundled
(no remote code), no browser chrome, offline-first. We'll add native touches
(haptics, proper splash) which also help featuring odds.

## Already done in this repo (were blockers, now closed)

- ✅ **Save durability:** iOS documents WKWebView localStorage as OS-evictable —
  bare localStorage would eventually delete players' saves. Saves now mirror to
  `@capacitor/preferences` (native storage) with furthest-progress wins on boot.
- ✅ **Versioned save migration** so app updates never corrupt old saves
  (proven in the browser test harness).
- ✅ Capacitor iOS/Android platforms configured; CI builds a working Android APK.

## Remaining engineering checklist (code-complete → store-ready)

| # | Task | Est. |
|---|---|---|
| 1 | "Tap to begin" boot screen (WebAudio requires a user gesture before sound; also our future audio unlock) | 0.5d |
| 2 | `@capacitor-community/keep-awake` during play; pause/persist on `appStateChange` | 0.5d |
| 3 | Safe-area/notch + Android 15/16 edge-to-edge insets (`viewport-fit=cover` + `env(safe-area-inset-*)`; Capacitor 7 needs `@capacitor-community/safe-area`) | 1d |
| 4 | Lock portrait natively (Info.plist / AndroidManifest) | 0.25d |
| 5 | `npx @capacitor/assets generate` from a 1024² icon + 2732² splash (light/dark) | 0.5d |
| 6 | Set `targetSdkVersion` 35 now (API 36 required for updates after Aug 31, 2026 — calendar it); `ITSAppUsesNonExemptEncryption=false` in Info.plist | 0.25d |
| 7 | Haptics on riot/fire/decision (`@capacitor/haptics`) — cheap polish that Apple editors explicitly look for | 0.5d |
| 8 | Test release build on real iPhone + one Android + iPad compatibility mode (reviewers run iPhone apps on iPad; a crash there is a 2.1 rejection) | 1d |

## Store setup checklist (your accounts, ~2 days of forms)

**Both stores**
- One-page privacy policy ("everything stays on your device; nothing is
  collected") hosted on GitHub Pages — **mandatory even with zero data
  collection** — plus a support page/email.

**Apple (App Store Connect)**
1. New app record: name (≤30 chars), bundle id `com.wardenskeep.game`, SKU.
2. App Privacy: answer **"No, we do not collect data"** → "Data Not Collected"
   label. (Stays true only while we add no analytics/crash SDKs.)
3. **Age rating: Apple replaced the old tiers in July 2025** (now
   4+/9+/13+/16+/18+ with an expanded questionnaire). Answer honestly; expect
   **9+**, possibly 13+ for violence toward humans.
4. Screenshots — **simplified since 2024: only one 6.9" iPhone set required**
   (1290×2796 accepted); a 13" iPad set only if the build supports iPad.
   Decision: ship iPhone-only at launch (`TARGETED_DEVICE_FAMILY=1`), add iPad
   later as an update beat.
5. Export compliance: exempt (OS TLS only) — the Info.plist flag skips the
   per-build question.
6. **Build with current Xcode** — uploads require Xcode 26 / iOS 26 SDK since
   Apr 28, 2026.
7. TestFlight: internal (instant) → external public link (first build per
   version needs ~24h Beta App Review). Builds expire in 90 days.
8. **File the featuring nomination** (App Store Connect → Featuring) when the
   pre-order page opens.

**Google (Play Console)**
1. **Check the account's creation date first.** Personal accounts created after
   Nov 13, 2023 must run a closed test with **12+ testers, 14 continuous days**
   before production access (reduced from 20 in Dec 2024). Older accounts are
   exempt. This single fact decides whether Android launch takes days or ~3
   extra weeks — start the closed test on day 1 if it applies.
2. AAB with Play App Signing (let Google hold the signing key; keep the upload
   key safe — it's resettable).
3. Data Safety form: No collection / No sharing → "No data collected" badge.
4. IARC content rating questionnaire: expect **ESRB E10+ / PEGI 7–12**.
5. Managed publishing on: review completes first, we press the button.
6. Complete Android Developer Verification when Play Console prompts (rolling
   out through 2026).

## Review expectations

- Apple: 24–48h typical, first submissions trend slower; **budget one rejection
  cycle** (most common causes: crash on reviewer's device, broken URLs,
  screenshots not matching gameplay — all covered above).
- Google: 24h–7d for a first release from a quiet account.

## The IAP update (post-launch, when we ship "Warden's Pardon" ~$5 unlock)

- Plugin: **RevenueCat `@revenuecat/purchases-capacitor`** (maintained,
  StoreKit 2 + Play Billing under the hood; free tier covers us). Configure the
  product as **non-consumable**; ship a **Restore Purchases** button (hard
  Apple requirement 3.1.1).
- Apple: sign Paid Applications agreement + banking/tax; first IAP must be
  submitted *with an app version*. **Enroll in the Small Business Program
  (15% rate) BEFORE the IAP ships — it is not retroactive.**
- Google: enroll in the 15% tier (Account Group + ToS). Note: selling anything
  makes a **physical address publicly visible** on the Play listing — get a PO
  box or accept it. Any update after Aug 31, 2026 needs Play Billing Library 8+
  (current plugins handle it).

## Timeline (realistic, solo dev with a Mac)

| Phase | Duration |
|---|---|
| Engineering checklist above | ~4–5 days |
| Assets + store forms + privacy page | ~2 days |
| TestFlight + Play internal testing on real devices | 3–5 days |
| Play 12-tester gate (ONLY if account is post–Nov 2023) | 14–18 days, **in parallel** |
| Submissions + one rejection-cycle buffer | 3–7 days |
| **Total** | **~2–3 weeks** (older Play account) / **~4–5 weeks** (new account) |

## Calendar items (don't miss)

- **Aug 31, 2026:** Play updates must target API 36 (Android 16).
- **Before IAP ships:** Apple Small Business Program + Google 15% tier enrollment.
- **Each Apple major-OS release:** retest WebGL performance on hardware
  (historic WKWebView regressions, e.g. the iOS 15 canvas flag).

---

## Steam (PC) track — planned, parallel to mobile

The user wants a Steam release once the game is developed further. It runs on
the **same web build**, wrapped for desktop — no engine change. Tracked here so
the art pipeline (see `ART_AUDIO_SPEC.md` §9a–§10) is authored for it now.

**Prerequisites (money — needs the user, not code):**
- **Steamworks partner fee: $100 per app** (the "Steam Direct" recoupable
  deposit), one-time. This is the one hard cost gate; flag before store setup.
- A bank/tax profile in Steamworks (US W-9 / tax interview), like the mobile
  stores.

**Engineering (code-complete → Steam-ready):**
| # | Task | Est. |
|---|---|---|
| 1 | Landscape 1280×720 layout bundle + right-rail UI (ART_AUDIO_SPEC §10) | 3–4d |
| 2 | Mouse hover + keyboard shortcuts (Space/1–4/Esc) | 1d |
| 3 | Electron (or `steamworks.js`) desktop wrapper + build pipeline | 1–2d |
| 4 | Resolution/aspect handling incl. 21:9 pillarboxing; 1080p/1440p/4K QA | 1–2d |
| 5 | Steam overlay + Cloud saves mapped onto `profile.ts`/save system | 1d |
| 6 | (Optional) Steam Achievements mirrored from the in-game achievement set | 0.5d |

**Store graphics:** the exact Valve-mandated capsule/library/screenshot sizes
live in `ART_AUDIO_SPEC.md` §9a.3 — commissioned from the same artist as the
mobile key art for a coherent page.

**Store-page timing:** Steam rewards a **wishlist runway** — set up the "Coming
Soon" page ~1–3 months before launch and drive wishlists; they convert to
day-one sales and visibility. Budget that lead time separately from the mobile
submission windows above.
