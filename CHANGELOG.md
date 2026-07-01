# Changelog

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
