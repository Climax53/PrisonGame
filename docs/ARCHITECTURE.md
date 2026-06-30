# Architecture

The project's central decision: **a pure simulation core that knows nothing
about rendering, wrapped by a thin Phaser view.** This is what makes the game
testable, deterministic, and portable to any future engine or platform.

```
┌──────────────────────────────────────────────────────────────┐
│  src/core/   — PURE SIMULATION (no Phaser, no DOM, no Date)   │
│                                                              │
│   types.ts      domain model (GameState, Prisoner, …)        │
│   balance.ts    every tunable number, in one place           │
│   rng.ts        seeded deterministic PRNG (mulberry32)        │
│   names.ts      flavour name pools                            │
│   factory.ts    mint prisoners / guards / offers             │
│   state.ts      new-game construction + helpers              │
│   events.ts     state-driven random events                   │
│   simulation.ts advanceDay() — the ordered daily tick        │
│   actions.ts    applyAction() — validated player actions     │
│   util.ts       clamp / rounding                             │
│   index.ts      public surface + save/load (JSON)            │
│                                                              │
│   ✔ 100% unit-testable in plain Node (see test/)             │
└───────────────────────────┬──────────────────────────────────┘
                            │ reads state, calls advanceDay/applyAction
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  src/scenes/ + src/ui/   — PRESENTATION (Phaser)             │
│                                                              │
│   main.ts          Phaser bootstrap + FIT scaling            │
│   scenes/GameScene tab UI, renders state, routes taps        │
│   ui/theme.ts      palette + type scale                      │
│   ui/widgets.ts    buttons, bars, panels (touch-sized)       │
│   ui/save.ts       localStorage adapter (→ native storage)   │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Capacitor   — packages dist/ into native iOS + Android       │
└──────────────────────────────────────────────────────────────┘
```

## Why this shape

- **Determinism.** `Math.random`, `Date.now`, and `new Date()` are banned from
  the core. All randomness flows through a seeded PRNG whose cursor lives *in*
  `GameState`. Same seed + same actions ⇒ identical playthrough. That's what
  lets `test/simulation.test.ts` assert exact reproducibility and what will make
  future features like replays and cloud-verified scores trivial.
- **Testability.** Because the core is pure, the entire rule-set runs in
  millisecond unit tests with no engine, no headless browser, no mocking.
- **Save = `JSON.stringify(state)`.** State is plain data, versioned in
  `serialize`/`deserialize`. The browser adapter (`ui/save.ts`) persists to
  `localStorage`, which Capacitor maps to native WebView storage.
- **Re-render on change, not per frame.** A turn-based game has no need for a
  game loop driving simulation. `GameScene` rebuilds its tab content whenever
  state changes — simple, leak-free (`removeAll(true)`), and plenty fast.
- **Engine portability.** If we ever move off Phaser, only `src/scenes` and
  `src/ui` change; `src/core` and its tests come along untouched.

## The daily tick (`advanceDay`)

A fixed, ordered sequence — order matters and is asserted by tests:

1. **Income** — government pays per living prisoner.
2. **Wages** — pay warders; unpaid ones quit and stir unrest.
3. **Labour** — conscripted inmates produce resources, gain unrest, risk injury.
4. **Upkeep** — consume food, then firewood; shortfalls harm health/unrest.
5. **Unrest** — drift from crowding/severity minus guard suppression; guards
   recover fatigue.
6. **Pre-event deaths** — starvation/cold/brutality casualties → reputation.
7. **Events** — `resolveEvents` (riot/fire/disease/escape/inspection/bribe).
8. **Releases** — served sentences free up cells, gain reputation.
9. **Reputation** — calm-day gain, clamp to [0,100], recompute tier.
10. **Roster sweep & age** — remove dead/escaped/freed, tick sentences.
11. **Intake** — generate next day's offers from the current tier.
12. **Game-over check** — reputation 0 or coin < −100.

## Testing strategy

| Layer | Tooling | What's covered |
|---|---|---|
| Core logic | **Vitest** (`test/*.test.ts`) | RNG determinism, economy, upkeep/starvation, events under stress, all player actions, progression tiers, save/load — **36 tests** |
| Boot + integration | **Playwright** headless Chromium (`scripts/smoke.mjs`) | Game boots with zero console errors, core drives real days in-browser, screenshot captured |
| Type safety | **tsc** strict mode | whole project |

`npm run check` runs all three. CI (`.github/workflows/ci.yml`) runs it on every
push/PR.

## Build & mobile pipeline

- **Vite** bundles to `dist/`. Phaser is split into its own chunk
  (`manualChunks`) so the ~26 kB game logic stays independently cacheable.
- **Capacitor** (`capacitor.config.ts`, appId `com.wardenskeep.game`) wraps
  `dist/` into native shells:
  ```bash
  npm run build
  npx cap add ios        # once
  npx cap add android    # once
  npx cap sync           # after each build
  npx cap open ios       # → Xcode  (Apple Developer license)
  npx cap open android   # → Android Studio (Samsung/Play license)
  ```
- Portrait `FIT` scaling from a fixed 720×1280 design resolution means one
  layout adapts to every phone aspect ratio with letterboxing.

See [ROADMAP.md](./ROADMAP.md) for the path from this slice to the stores.
