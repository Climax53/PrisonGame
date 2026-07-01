# Roadmap — from slice to stores

This is the practical, professional path to shipping *Warden's Keep* on the
Apple App Store and Google Play (Samsung). Each phase has a clear exit criterion.

## ✅ Phase 0 — Vertical slice (DONE, this repo)

The fun is real and the foundation is professional.

- [x] Pure, deterministic simulation core (`src/core`)
- [x] Full core loop: intake → labour → upkeep → unrest → events → income →
      reputation → tiers → loss conditions
- [x] All resources (coin, food, firewood, buckets) + sanitation/fire tension
- [x] Guards (skill/brutality/wage/fatigue) and conscripted labour with risk
- [x] Six state-driven random events
- [x] Reputation-gated progression (village → crown)
- [x] Playable Phaser UI: HUD, Keep/Offers/Market tabs, Chronicle log, game-over
- [x] Save/load (localStorage → native storage via Capacitor)
- [x] **36 unit tests + headless-browser smoke test, all green**
- [x] CI, build pipeline, Capacitor config

**Exit:** ✔ playable, tested, builds clean. You can `npm run dev` and play now.

## Phase 1 — Production feel (2–4 wks) — *in progress*

Make it *look* and *feel* shipped.

- [x] **Animation & juice**: animated bars, floating number pop-ups,
      day-transition wipe, screen-shake + colour-flash on riots/fires, tab-slide
      transitions, button feedback (`src/ui/fx.ts`, verified in-browser)
- [x] **"Event card" choice moments** (quell riot brutally vs. fairly; take the
      bribe?) — deterministic decision system with telegraphed consequences
      (`src/core/decisions.ts`)
- [x] **Reduced-motion accessibility toggle** (respects OS `prefers-reduced-motion`)
- [x] **Player-sentiment research** grounding the design ([docs/research](./research))
- [x] **Rarity system** — common→mythic notoriety axis for inmates & guards,
      tier-scaled odds (`src/core/rarity.ts`)
- [x] **Danger forecast** — honest next-day risk bars sharing the event engine's
      probabilities (`src/core/danger.ts`) — research directive #3
- [x] **Morality system** — two-sided Tyrant↔Saint standing that cross-couples
      into unrest, labour, escapes, riots, and reputation (`src/core/morality.ts`)
- [ ] Real top-down pixel art: tileset, prisoner/guard sprites, cell interiors
      (replace programmatic placeholders — no logic changes needed)
- [ ] Audio: ambient loop, event stingers, UI clicks (Howler or Phaser audio)
- [ ] Onboarding/tutorial first run; full settings panel (sound, reset, credits)
- [ ] Per-inmate identity (crime, temperament, remembered grudges) + name-drops
      in the log — research directive #2
- [ ] Danger telegraphing ("riot likely tomorrow") — research directive #3
- [ ] Undo / honest confirms on destructive actions — research directive #7
- [ ] Colour-blind pass + text scaling

**Exit:** a stranger can install, understand, and enjoy it with no explanation.

## Phase 2 — Depth & retention (3–6 wks)

- [ ] Keep upgrades: infirmary, chapel, gallows, walls (each a new dial)
- [ ] Named story prisoners with multi-day arcs
- [ ] Seasons/weather affecting firewood & disease
- [ ] Guard traits, training, corruption
- [ ] Achievements, score/leaderboard, daily-seed challenge run
- [ ] Cloud save (Capacitor Preferences + a backend or Game Center / Play Games)
- [ ] Localization scaffold (externalize strings)

**Exit:** D1/D7 retention validated in playtests; a reason to come back daily.

## Phase 3 — Soft launch & monetization (2–4 wks)

- [ ] Premium-lite model wired (see GDD §11): one-time "Royal Charter" IAP,
      optional rewarded "messenger", cosmetic keep skins
- [ ] Analytics (funnel, balance telemetry) + crash reporting
- [ ] Soft launch in 1–2 small markets; tune balance from real data
- [ ] Store assets: icon, screenshots, trailer, descriptions, privacy policy

**Exit:** stable KPIs, positive unit economics in soft-launch markets.

## Phase 4 — Global launch

- [ ] App Store submission (Xcode, App Store Connect — **Apple Developer license**)
- [ ] Google Play / Samsung submission (Android Studio — **Play Console license**)
- [ ] Age rating, data-safety / privacy declarations, content guidelines review
- [ ] Marketing beats, launch build, post-launch live-ops calendar

---

## Store-readiness checklist (you already hold the licenses)

| Requirement | iOS | Android |
|---|---|---|
| Developer account | ✔ Apple Developer | ✔ Google Play / Samsung |
| Bundle/app id | `com.wardenskeep.game` | `com.wardenskeep.game` |
| Build toolchain | Xcode via `npx cap open ios` | Android Studio via `npx cap open android` |
| Icons & splash | `@capacitor/assets` generates all sizes | same |
| Privacy policy URL | required | required (Data safety form) |
| Age rating | App Store questionnaire | IARC questionnaire |
| Screenshots | per device class | per device class |

> Tip: `npm i -D @capacitor/assets` then `npx capacitor-assets generate` turns a
> single 1024×1024 icon + splash into every required iOS/Android asset.

## Always-true definition of done (every phase)

Search before building · test before shipping · `npm run check` green ·
documentation updated · the build runs on a real device.
