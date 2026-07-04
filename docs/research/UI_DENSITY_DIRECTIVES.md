# UI Density, FTUE & Monetization — Research Directives (July 2026)

Research pass over current mobile-game UI/UX and monetization guidance
(sources at bottom), distilled into binding directives for Warden's Keep.
Applied by the "World-Class Pass" implementation.

## 1. Space usage — what top-grossing management/sim games do

Observations from the genre's top performers (Fallout Shelter, Clash-family
top bars, AdVenture/Egg-style idle sims, Two Point-style management):

| Pattern | Directive for us |
|---|---|
| **Every band of the screen works.** Top bar = identity + currencies + alerts; middle = the living scene; bottom = navigation + primary action. No decorative dead strips. | Kill blank margins: postcard, status, roster, chronicle tightened; headers merge INTO panels (title rows overlay panel chrome, not above it) |
| **The scene IS the screen.** The dominant visual is the game world (the vault, the base), not a menu — menus float OVER the world. | The cell block becomes a drawn JAIL MAP (corridor, flanking cells, patrolling warders) — not a grid of cards |
| **Tap-anything inspection.** Every entity opens a detail sheet; primary actions live in the sheet, not hidden cycles. | Prisoner tap → full dossier sheet with direct labour picker (replaces blind tap-to-cycle) |
| **Display type is BIG and thematic**; body type stays utilitarian. Titles 28–40px equivalent, one glance = one fact. | Pirata One (blackletter, OFL) for titles/numbers-that-matter; MedievalSharp (OFL) for buttons/subheads; monospace stays for body/stat rows |
| **Constant micro-motion.** Idle characters, resource ticks, pulsing alerts — the screen is never a still image, but motion never blocks input. | Hourly coin drips float; prisoners mutter (speech bubbles); danger bars pulse ≥60%; Retire button glows at the bell; patrolling warders on the map |
| **Badging & affordance.** Anything actionable shows a count or glow. | Offers tab badge (have), decision glow, FTUE checklist chip with progress |

## 2. FTUE — the first five minutes decide D1 retention (20–40% industry band)

- **Learn by doing, not by reading.** Interactive quests > tooltip lectures.
  → "The First Decrees": a 5-step doing-checklist (accept, assign, buy,
  skip-to-evening, retire) each paying a small coin reward on completion;
  the old 5-panel tour is cut to 3 panels.
- **A "win" in minute one.** Early visible reward → the Letter of
  Appointment (magistrate portrait, your name and keep illuminated) + a
  signing bonus framed as won, not given.
- **Progressive disclosure.** Don't teach morality/legends/danger math on
  day 1; surface systems when they first fire (already our decision model).
- **Never block skipping.** Checklist is dismissible; tour skippable (kept).

## 3. Monetization — ethical scaffolding (no store connected yet)

Consensus: transparent pricing, earnable premium currency, cosmetic/content
DLC over pay-to-win, no manufactured frustration, single-purchase respect.

Design adopted (full rationale in docs/MONETIZATION.md):
- **Crowns 👑** — profile-level premium currency. EARNABLE now (deeds grant
  them; daily challenge pays them), PURCHASABLE later (adapter stubbed).
- **Warden DLC**: every warden stays earnable by play (trust); Crowns offer
  an instant-unlock shortcut — convenience, not exclusivity.
- **Keep Themes** (jail designs DLC): Midnight Keep / Winterhold — cosmetic
  re-dressings of the postcard + palette accent. Pure cosmetics.
- **Coin conversion**: Crowns → run coin, clearly labelled as a leg-up in a
  single-player game (no PvP harm), never required by balance.
- **No real-money UI now**: purchase buttons route to the payments adapter,
  which reports "storefront arrives with the App Store build" — nothing
  pretends to charge. StoreKit/Play Billing/Steam wiring documented.

Sources:
- [Pixune — Best Mobile Game UI Designs (2026 review)](https://pixune.com/blog/best-examples-mobile-game-ui-design/)
- [Sunstrike — HUD design guide](https://sunstrikestudios.com/en/blog/HUD_design_in_games/)
- [Appnality — Technical guide to mobile game UI/UX](https://www.appnality.com/blog/guide-to-mobile-game-ui-ux-design/)
- [Game Developer — Best practices for a successful FTUE](https://www.gamedeveloper.com/design/best-practices-for-a-successful-ftue-first-time-user-experience-)
- [Mistplay — Player retention guide](https://business.mistplay.com/resources/player-retention)
- [Maf.ad — Day 1 to Day 7 retention](https://maf.ad/en/blog/game-retention/)
- [Daydreamsoft — Ethical monetization system design](https://www.daydreamsoft.com/blog/ethical-monetization-system-design-earning-revenue-without-losing-player-trust)
- [Setupad — Game monetization models](https://setupad.com/blog/game-monetization-models/)
