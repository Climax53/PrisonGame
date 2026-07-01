# Changelog

## Unreleased — "Rarity, Danger & Morality" cycle

Three interlocking systems that give the game its identity.

### Added
- **Rarity system** (`src/core/rarity.ts`) — every inmate and guard rolls a
  rarity (common → uncommon → rare → epic → legendary → mythic) on a second axis
  from crime severity. Rarer inmates pay far more and work harder but are more
  volatile and cunning (high-risk/high-reward); rarer guards roll higher skill
  at a higher wage. Rarity odds improve with the warden's tier — a
  collection/progression hook. UI: rarity-tinted names + badges on cards,
  offers, and the guard roster.
- **Danger forecast** (`src/core/danger.ts`) — honest next-day risk bars for
  riot / fire / sickness / escape, computed from the *same* probability formulas
  the event engine rolls against (single source of truth). Shown as
  growing/shrinking bars in a new Keep-tab status strip. They're probabilities,
  not certainties — the dice still roll, so hard on-the-fly choices remain.
  Implements research directive #3 (telegraph danger the day before).
- **Morality system** (`src/core/morality.ts`) — a −100 (Tyrant) … +100 (Saint)
  standing that drifts from how the warden treats inmates. Two-sided by design:
  cruelty fears the cells into order and hard labour but makes cornered riots
  deadlier and stains reputation on every death; kindness wins reputation and
  calmer riots but breeds disrespect, slacking, and escapes. Diverging morality
  bar + standing label in the UI.

### Changed
- Factory rolls + applies rarity to payout, guard skill/brutality, and wage.
- The daily tick and decisions now cross-couple morality into labour output,
  unrest drift, escape/riot odds, and all reputation deltas; rarity into unrest,
  labour, escape cunning, and release/escape reputation swings.
- `events.ts` now sources its probabilities from `danger.ts`.

### Tests / verification
- Suite grown **49 → 75** (new `rarity`, `morality`, `danger` suites, incl. a
  forecast-matches-reality property test).
- Browser smoke asserts morality is live, prisoners/guards carry rarity, and
  crushing a riot measurably lowers morality. Proof: `docs/img/keep-systems.png`.

## Unreleased — "Decisions & Juice" cycle

Grounded in a two-front player-sentiment research pass (see
[`docs/research`](docs/research/DIRECTIVES.md)); both studies converged on
telegraphed trade-off decisions and legible, *felt* consequences as the highest-
value work.

### Added
- **Decision system** (`src/core/decisions.ts`) — riots and bribes now pause the
  day and present a hard choice with telegraphed consequences, resolved
  deterministically:
  - **Riot:** Crush it · Negotiate · Let it burn out
  - **Bribe:** Pocket it · Refuse · Demand double
  - Effects deferred to the chosen option; reproducible given (seed + choices).
  - The game never scolds a valid choice — consequences, not narration, judge.
- **Animation & juice layer** (`src/ui/fx.ts`) — animated stat bars, floating
  number pop-ups, a day-transition wipe, screen-shake + colour-flash on
  riots/fires, tab-slide transitions.
- **Reduced-motion accessibility setting** (`src/ui/settings.ts`), defaulting to
  the OS `prefers-reduced-motion` preference; a HUD gear toggles it.
- **Animated decision modal** in `GameScene`, blocking input until answered.
- **Player-sentiment research** reports + synthesized directive tracker under
  `docs/research/`.

### Changed
- `resolveEvents` now returns `{ events, decision? }`; riot/bribe no longer
  auto-resolve.
- `advanceDay` and `applyAction` are no-ops while a decision is pending (the
  crisis must be answered first).
- Shared casualty selection (`killWeakestPrisoners`) and game-over evaluation
  (`evaluateGameOver`) extracted to `src/core/state.ts` to avoid duplication /
  import cycles.

### Tests / verification
- Test suite grown **36 → 49** (new `test/decisions.test.ts`; events suite
  updated for the decision model).
- Headless-browser smoke test extended to drive animated days, force a **real
  riot decision**, render and resolve the modal, and assert zero console errors.
  Proof screenshots: [`docs/img/riot-decision.png`](docs/img/riot-decision.png).

## 0.1.0 — Vertical slice
- Initial playable, tested slice: deterministic simulation core, resources,
  guards, conscripted labour, six events, reputation tiers, Phaser mobile UI,
  save/load, CI, and Capacitor packaging.
