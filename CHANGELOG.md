# Changelog

## Unreleased — "The Painted Keep" cycle (art round 1 integrated)

### Added
- **The commissioned art set is live.** 225 artist masters (assets/art/)
  processed into 131 game-ready WebP assets (public/art, 4.2 MB total) by a
  new pipeline (`scripts/process-art.py`) that reconstructs true alpha from
  the delivered checkerboard backgrounds (border flood-fill + checker-parity
  pattern matching), crops, resizes, compresses, and generates a typed
  manifest (`src/ui/artManifest.ts`). Loaded by a themed preloader with a
  progress bar; every art lookup degrades gracefully to the original emoji
  placeholder if a file is missing.
- **The living keep postcard**: your keep painted at your tier (village
  lock-up → town gaol → city castellany → crown keep), the light changing
  with the live clock (day → dusk → night-torchlit) and snow settling over
  it in winter (additive drifting-snow overlay + animated torch sconces
  after dusk).
- **Portraits everywhere**: 8 prisoner bases (severity × gender, chosen
  stably per inmate) inside 6 rarity frames (common→mythic) on Keep cards,
  Offers dispatches, and the Cells tab; 7 warden portraits in the setup
  carousel; 3 legend portraits fronting their story beats; supporting-cast
  and pip art staged for future scenes.
- **Cinematic decision banners**: all 10 decision kinds (riot, bribe, the 8
  story cards) open under their own painted banner; each kind now also has
  its own headline (was riot/bribe-only). Legends show their portrait.
- **Painted endings**: all 6 endings (4 victories + disgraced + debtor's
  walk) crown the reign summary with their vignette.
- **Icon set**: resources, forecast chips, tabs, danger bars, morality
  scales, labour assignments, buildings, settings gear — 44 painted icons
  replacing emoji throughout the HUD, Market, and cards.
- **Cells tab dressed**: stone-floor tile backdrops (plain/cracked/mossy,
  snow-dusted in winter), open-door bars for empty cells, framed portraits
  for occupants.
- **VFX**: fire-burst on fire events, coin sparkles on gains, smoke puff on
  construction, looping torch flames — sliced from the delivered strips into
  spritesheets by the pipeline (frame detection via alpha projection).
- **Identity**: carved-stone logo wordmark + key-art backdrop on the setup
  sheet; painted heraldry sigils (8, matching the SIGILS order) in the
  picker and HUD; the painted app icon is now the favicon/apple-touch-icon.
- Renderer switched to linear filtering (`antialias: true`) — correct for
  painterly downscaled art; smoke suite grown to 37 assertions (art
  textures, VFX anims).
- **`docs/ART_ROUND2_REQUESTS.md`**: the precise re-commission list — the
  few assets that could not be used as delivered (accessory overlays and
  body sheets need template alignment / uniform grids; nothing was
  force-fitted) plus newly discovered gaps (guard portraits, barracks
  icon, morale faces, empty-state art).

## Unreleased — "The Living Day" cycle (playtest rounds 1–2)

### Added (round 2)
- **The day advances on its own.** A live, presentation-only ticker now glides
  the sun-strip and shows a **countdown to nightfall** (`⏳ m:ss to dusk`) beside
  the reputation bar — the passage of time is visible without the player
  touching anything. After the bell it reads `🌙 nightfall`; while a decision
  is pending it shows `⏸`. Built from the hour timer's live remaining time, so
  it stays in lockstep with the deterministic core.
- **Steam / desktop resolution requirements** folded into the art pipeline
  (`docs/ART_AUDIO_SPEC.md` §9a–§10, `docs/RELEASE_PLAN.md`): in-game landscape
  target ladder (1280×720 → 4K, incl. 21:9 ultrawide), asset resolution
  multipliers, the full set of Valve-mandated Steam capsule/library/screenshot
  sizes, an animation-authoring note, and a landscape-layout engineering plan +
  Steam release track (the $100 Steam Direct fee flagged). No asset above has
  to be redrawn when the PC layout lands.

### Fixed (round 2)
- **Forecast chips now update live** when you re-task a prisoner: `cycleLabor`
  refreshes the HUD, not just the card, so the ±/day numbers move the instant
  you change a job (previously stale until the next hour tick).

### Added (round 1)
- **Day/night cycle** (`advanceHour`/`retire` in `src/core/simulation.ts`):
  the sun crosses on its own — one in-game hour every 10 real seconds, from
  6am to the 9pm evening bell. Coin and labour output accrue in hourly
  slices (RNG-free, so real-time ticking can never desync a save); after the
  bell no more progress is possible until the player **Retires for the
  Night**, which resolves wages, meals, warmth, unrest, morale, events, and
  intake in the fixed nightly order. "⏩ Skip to Evening" fast-forwards the
  remaining daylight. The HUD shows an hour badge and a sun-strip of
  daylight spent; `advanceDay()` remains the full-day wrapper the tests and
  bot harness drive.
- **Resource forecast chips** (`projectDay`): each HUD resource now carries
  a small ±/day indicator — the deterministic expected daily movement given
  today's roster, assignments, wages, and buildings (random events
  deliberately excluded; the danger bars cover those).
- **Cells tab**: the block drawn cell by cell — every inmate's bunk numbered
  and visible, tap an occupant to re-task them; over-capacity inmates wait
  in "the Yard". Cell numbers also appear on Keep-tab prisoner cards.
  Assignment is stable: lowest free cell, kept across days, freed bunks
  reused (`assignCells` in `src/core/state.ts`).
- **Warder needs & morale** (`updateGuardNeeds`): warders now eat first from
  the larder, expect pay, need bunks (3 base; **🛏 Barracks** adds 4), and
  enjoy the **🍺 Tavern** (+4 morale/day). Unpaid, unfed, or crowded corps
  sour; morale under 25 risks a resignation each night; morale scales guard
  effectiveness (a miserable corps suppresses at 60% of its rested best).
  Morale faces and bunk counts shown in the Market roster and HUD.
- Test suite 141 → 160 (`test/time-guards-cells.test.ts`: hour-clock
  determinism incl. exact hour-by-hour ≡ advanceDay equality, guard needs,
  cell invariants, forecast-matches-reality, sentence bands, v4→v5
  migration). Browser smoke now proves dawn hour, bell lock, hourly accrual,
  unique cells, morale, and the Cells tab render.

### Changed
- **Sentences lengthened** to a 14–30-day band (petty 10–16, violent 14–24,
  political 18–28, noble 22–32): holding a common now occupies a cell for
  weeks, so intake becomes a real portfolio choice when an epic might knock.
- Save format bumped to **v5** (hour, guard morale, prisoner cells,
  barracks/tavern) with v4 migration + repair defaults.
- Market tab compacted (provisions and muster rows) to fit the two new
  buildings; guard roster rows show morale.

### Fixed
- Chronicle entries no longer overlap the rows beneath the prisoner list:
  one entry per line, clipped with an ellipsis instead of wrapping into the
  next row's 20px pitch.

## Unreleased — "Wardens, Legends & the Crown's Whim" cycle (Tiers 1–2)

### Added
- **Seven playable wardens** (`src/core/wardens.ts`): Steward (default),
  Veteran, Confessor, Butcher, Merchant, Reformer, Gambler — each a bundle of
  pure rule modifiers (prices, wages, intake pay, reputation, labour, crush
  toll, rarity odds, danger/opportunity heat, starting morality/guards).
  All earned through play; nothing sold.
- **Achievements** (`src/core/achievements.ts`): 12 deeds evaluated against
  live state; six unlock warden classes. Cross-run profile persistence
  (`src/ui/profile.ts`, mirrored to native storage) with toasts on earn.
- **Named legends** (`src/core/legends.ts`): Prince Alaric the Deposed,
  Mirabel the Alchemist, Bishop Odo — legendary/mythic arrivals with
  multi-beat story arcs (ransoms, escape plots, royal writs), each at most
  once per run, resolved through the decision modal.
- **Keep buildings**: infirmary (daily healing), chapel (daily calm), gallows
  (fear: quiet + fewer escapes, hardens the soul), high walls (halves escape
  risk — the danger forecast reflects it, single source of truth). One-time
  purchases in the Market.
- **The Crown's Whim** pacing modes: slow / steady / chaos scaling danger and
  opportunity odds; switchable mid-run with no penalty.
- **Warden & keep identity**: names (rollable), 8 sigils × 8 banner colours,
  shown on the HUD, endings, and the shareable summary.
- **Daily challenge**: date-seeded run (same seed for every player — the
  deterministic core makes this free), fixed loadout, one attempt per day.
- **New-reign setup screen**: warden carousel with unlock hints, identity
  forge, pacing pick, daily-challenge entry; reachable from game over and the
  new settings sheet ("The Warden's Desk": reduced motion, deeds ledger,
  profile stats, new reign).
- **Haptics** (`@capacitor/haptics`): impacts on shakes/flashes, success
  notification on achievements/victory; no-op on web.
- **Art & audio commissioning spec** (`docs/ART_AUDIO_SPEC.md`): every still,
  animation, and sound with dimensions, frame counts, formats, priorities,
  and indicative budgets.

### Changed
- Save format v5-ready: v4 migration (warden/identity/pacing/buildings/
  legends) with repair defaults; older saves keep migrating cleanly.
- Tests 117 → 141; browser smoke now proves warden/buildings/pacing systems
  live and renders the setup screen (20 assertions).

## Unreleased — "Run Arc & Story Deck" cycle (Tier 0 content)

### Added
- **Victory & themed endings** (`src/core/endings.ts`): hold Crown tier 30
  consecutive days to win (👑 countdown badge in the HUD). The victory's flavor
  reflects the reign — ☠ Iron Warden (tyrant), 🕊 Shepherd of the Lost (saint),
  🪙 Coin-Counter (rich), 👑 Keeper of the Crown (default); losses are themed
  too (⚖ Disgraced, 📜 Debtor's Walk). Machine-play harness proves victory is
  genuinely reachable by prudent play in most seeds.
- **The reign summary**: every ending shows "The Reign in Numbers" (days ruled,
  coin taken in, freed/deaths/escapes, riots faced, hard choices made, rarest
  inmate held, peak reputation, final standing) with a **Save Summary** button
  that exports the screen as a PNG — the shareable-run marketing loop.
- **Story decision deck** (`src/core/storyDecisions.ts`): 8 eligibility-gated
  dilemma cards — plague doctor, caught ringleader, noble's family visit,
  smuggling guard, magistrate's "special treatment" order, starving village,
  prisoner duel, riot informant — each with 3 telegraphed options and
  morality/coin/reputation couplings. At most one decision per day.
- **4 new auto events**: harsh winter (double firewood for 3 days, ❄ badge),
  royal amnesty (frees petty prisoners), the famous bard (reputation swing
  keyed to the keep's state), rat plague (spoiled stores).
- **First-run onboarding** (`src/ui/onboarding.ts`): five-step, always-skippable
  gold-ring tooltip tour; shows exactly once (persisted in settings).
- **Run statistics** tracked across every death/escape/release/income path.

### Changed
- Save format v3 (stats/crownDays/winter) with migration from v2 and v1.
- Browser smoke now proves the victory flow end-to-end (forces the crown clock,
  wins, renders the summary) and that onboarding appears for a fresh warden.
  Tests 102 → 117.

## Unreleased — "Professionalization" cycle

### Fixed (independent adversarial review — 10 findings, all resolved)
- **Fines could PAY an indebted warden:** with negative coin, a disorderly
  inspection's `min(coin, fine)` went negative and *added* money. Fines now
  seize only seizable coin.
- **Failed payroll silently erased debt** (clamped negative balances to 0),
  making bankruptcy nearly unreachable via wages. Partial payment now spends
  only what exists; debt persists.
- **Cross-device determinism break:** victim selection drew RNG inside a sort
  comparator (invalid comparator + engine-dependent draw count — a save
  replayed on iPhone vs desktop would diverge). Scores are now precomputed,
  exactly one draw per prisoner (proven by an RNG-cursor test).
- Payroll failure no longer reshuffles the visible guard roster.
- A briber who left the keep before the player answered no longer pays out;
  riots can no longer charge for "phantom" rioters after same-tick releases
  (costs/deaths capped by the real living count; empty keep fizzles).
- Disease deaths now darken morality and fatigue guards like every other
  neglect death.
- Decision outcome events now carry their real coin/reputation deltas.
- New-game seeds mix in wall-clock time (fresh installs previously clustered
  onto near-identical seeds).
- Game over clears any pending decision from the save.
- New `test/audit-fixes.test.ts` regression suite encodes every finding;
  tests 87 → 102.

### Fixed (audit findings — Step 1 of the professionalization pass)
- **Critical:** saves from the previous release (pre-morality/pre-rarity)
  loaded and then hard-crashed the game on the first End Day. New versioned
  save-migration system (`src/core/save.ts`) with a defensive repair pass;
  proven end-to-end by forging a legacy save in the browser test.
- **Data-loss risk (iOS):** saves now mirror to native storage via
  `@capacitor/preferences` (WKWebView localStorage is OS-evictable).
- Keep roster paginated — inmates beyond the visible rows were unreachable.
- Guards can now be dismissed (two-tap confirm); the core action had no UI.
- End Day re-entrancy guard (double-tap could advance two days).
- Flaky smoke assert: forced riots now guarantee a populated roster.

### Added
- **Playability harness** (`test/playability.test.ts`): bot wardens
  (prudent/cruel/greedy/passive) machine-play up to 200 days across dozens of
  seeds; asserts no state corruption and a real difficulty curve. Tests 75→87.
- **Decision documents** grounded in five research passes:
  `docs/CONTENT_ROADMAP.md` (content gap analysis), `docs/MARKETING_PLAN.md`
  (go-to-market with budget tiers), `docs/RELEASE_PLAN.md` (2026 store
  submission playbook), `docs/research/marketing-intelligence.md` (raw findings).

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
