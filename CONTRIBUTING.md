# Contributing to Warden's Keep

## The golden rule

**Game rules live in `src/core/`. The Phaser layer (`src/scenes/`, `src/ui/`)
only renders state and routes input.**

If you find yourself writing an `if` about *what should happen in the game*
inside a scene, it belongs in the core instead — with a test.

## Core constraints (enforced by tests & review)

- **No `Math.random()`, `Date.now()`, or `new Date()` in `src/core`.** All
  randomness flows through the seeded `Rng` whose cursor lives in `GameState`.
  This keeps the game deterministic and testable. (`performance.now()` for a
  new-game seed is fine — but only at the UI boundary, never inside the core.)
- **`GameState` stays plain JSON.** No class instances, no functions, no
  `Map`/`Set` on the state object — saving is `JSON.stringify(state)`.
- **All tunable numbers go in `src/core/balance.ts`,** never inline.
- **New player action?** Add it to the `PlayerAction` union and handle it in
  `applyAction`; the `never` exhaustiveness guard will fail the build if you
  forget a case.

## Workflow

```bash
npm install
npm run dev            # play while you work
npm test -- --watch    # TDD the core
npm run check          # full gate before you push: typecheck + tests + verify
```

Every change to the core should come with a test. Every change that could affect
boot or rendering is covered by `npm run verify` (real headless browser).

## Adding a feature — the pattern

1. Model it in `src/core/types.ts`.
2. Put its numbers in `balance.ts`.
3. Implement the logic in the right core module (or a new one) as pure
   functions over `GameState`.
4. Wire it into the daily tick (`simulation.ts`) and/or `actions.ts`.
5. **Write Vitest tests** — at minimum determinism + the happy path + one edge.
6. Render it in `GameScene` using existing `ui/widgets.ts` helpers.
7. `npm run check` must be green.

## Code style

- TypeScript strict mode; no `any` without a comment justifying it.
- Comment the *why*, not the *what*. The existing core files set the tone.
- Keep functions small and pure where possible.

## CI

`.github/workflows/ci.yml` runs `npm run check` (typecheck + unit + browser
smoke) on every push and PR. Keep it green.
