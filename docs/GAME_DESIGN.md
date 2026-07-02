# Warden's Keep — Game Design Document

> A medieval jail-management sim for phones. You are the warden. Keep order,
> manage scarce resources, work your prisoners, and climb from a village
> lock-up to keeper of the crown's most dangerous captives.

**Document status:** living. Last revised against the v0.1 vertical slice.

---

## 1. Vision & Fantasy

You inherit a crumbling village gaol. Every day brings hungry mouths, dwindling
firewood, restless inmates, and a magistrate who pays you to keep dangerous
people off the streets. Do well — few deaths, few escapes, no fires — and your
reputation grows until the crown itself entrusts you with political prisoners
and disgraced nobles whose board pays handsomely.

The fantasy is **competent cruelty under pressure**: you are not a hero. You are
a manager balancing coin, order, and your own reputation, constantly tempted to
cut corners (overcrowd cells, skimp on sanitation, conscript inmates into
dangerous labour, pocket a noble's bribe) — and every shortcut has a risk.

### Design pillars

1. **Every shortcut has a cost.** Overcrowding earns more but breeds riots.
   Conscripted labour produces resources but injures and angers inmates.
   Brutal guards keep order but kill, and killing tanks reputation.
2. **Reputation is the spine.** It gates progression, scales pay, and is the
   one resource you can't buy — only earn through good management.
3. **Readable on a phone, in one hand, in short sessions.** Turn-based days,
   tab-based UI, big touch targets, no twitch reflexes.
4. **Deterministic, fair systems.** No hidden coin flips the player can't
   reason about. Risk is always legible: high unrest *visibly* means danger.

---

## 2. Core Loop

```
        ┌─────────────────────────────────────────────┐
        │  REVIEW the keep (Keep tab)                  │
        │   • inmate health / unrest / sentences       │
        │   • assign labour (risk vs. resource gain)   │
        ├─────────────────────────────────────────────┤
        │  DECIDE intake (Offers tab)                  │
        │   • accept/decline government prisoners       │
        │   • higher severity = more pay + more danger │
        ├─────────────────────────────────────────────┤
        │  SPEND (Market tab)                          │
        │   • food, firewood, sanitation buckets        │
        │   • hire warders, expand cells                │
        ├─────────────────────────────────────────────┤
        │  END DAY  ──►  SIMULATION TICK                │
        │   income → wages → labour → upkeep → unrest  │
        │   → random events → deaths → releases →      │
        │   new offers                                 │
        └────────────────────┬────────────────────────┘
                             │  consequences feed back in
                             ▼
                     (repeat, reputation trends up or down)
```

A "turn" is one in-game **day**. The player takes any number of free actions,
then commits with **End Day**, which runs the deterministic simulation tick
(`advanceDay`) and surfaces the day's headline event.

---

## 3. Resources

| Resource | Source | Sink | Failure mode |
|---|---|---|---|
| **Coin** 🪙 | Government per-prisoner daily pay, bounties, bribes, inspections, smithy labour | Wages, food/wood/buckets, hiring, upgrades | < −100 → bankruptcy (loss) |
| **Food** 🍖 | Bought; kitchen labour | 1/prisoner/day | Shortfall starves inmates (health↓, unrest↑) |
| **Firewood** 🪵 | Bought; woodcutting labour | 0.5/prisoner/day for warmth | Shortfall chills cells (health↓, unrest↑); **excess >50 raises fire risk** |
| **Buckets** 🪣 | Bought; latrine labour | Sanitation: 2 inmates/bucket | Debt drives gaol-fever (disease) |
| **Reputation** ⭐ | Releases, calm days, good inspections | Deaths, escapes, scandals | 0 → dismissed (loss) |

Firewood is deliberately double-edged: you need it for warmth, but hoarding it
is a fire hazard — a small, legible tension that rewards just-in-time buying.

All tunable numbers live in [`src/core/balance.ts`](../src/core/balance.ts) so
the economy can be re-balanced without touching logic.

---

## 4. Prisoners

Each inmate has: **severity**, **rarity**, **health** (0–100, death at 0),
**unrest** (0–100, fuels riots/escapes), **sentence** (days remaining → release
on 0), and a **labour assignment**.

### Rarity — the notoriety axis (`src/core/rarity.ts`)

Orthogonal to crime severity, every inmate and guard carries a rarity:
**common → uncommon → rare → epic → legendary → mythic**. It's a high-risk /
high-reward and progression dial:

| Rarity | Prisoner: pay | labour | unrest | escape cunning | Guard: skill | wage |
|---|---|---|---|---|---|---|
| common | ×1.0 | ×1.0 | ×1.0 | ×1.0 | 20–45 | ×1.0 |
| uncommon | ×1.35 | ×1.05 | ×1.1 | ×1.1 | 30–55 | ×1.2 |
| rare | ×1.8 | ×1.1 | ×1.25 | ×1.3 | 42–68 | ×1.45 |
| epic | ×2.4 | ×1.15 | ×1.45 | ×1.6 | 55–80 | ×1.8 |
| legendary | ×3.2 | ×1.2 | ×1.7 | ×2.0 | 68–90 | ×2.3 |
| mythic | ×4.5 | ×1.25 | ×2.0 | ×2.5 | 82–99 | ×3.0 |

A mythic inmate is a fortune in daily pay and works a touch harder — but is
wildly volatile, escapes cunningly, and losing one is a headline scandal
(reputation swing scales with rarity). **Rarity odds improve with your tier**
(a village sees only common/uncommon; the crown surfaces legendaries and
mythics), giving a collection/progression hook on top of the reputation ladder.

| Severity | Daily pay (base) | Unrest pressure | Sentence | Sent at tier |
|---|---|---|---|---|
| Petty | 6 | low | 4–8d | village+ |
| Violent | 14 | high | 8–16d | village+ |
| Political | 30 | med-high | 14–26d | town+ |
| Noble | 55 | medium | 20–40d | city+ |

Higher severities pay far more but raise unrest and (for political/noble) can
trigger **bribe** events. Daily pay is locked at intake and scales with your
reputation (80% at rep 0 → 130% at rep 100).

### Conscripted labour

| Job | Produces | +Unrest | Injury risk |
|---|---|---|---|
| Woodcutting 🪓 | firewood | +2 | 4% |
| Kitchen 🍲 | food | +1 | 1% |
| Latrine 🪣 | buckets | +3 | 2% |
| Smithy 🔨 | coin | +3 | 5% |

Output scales with the worker's health. Labour is the core risk/reward dial:
free resources, but it angers and endangers your inmates, pushing toward the
events below.

---

## 5. Guards (Warders)

Each warder has **skill** (suppresses unrest, resolves events), **brutality**
(suppresses unrest *fast* but adds death risk and reputation loss), a **wage**
(paid daily — unpaid guards quit), and **fatigue** (rises on event days, lowers
effectiveness, recovers on calm days).

Guards are the player's main lever against unrest, but they are a recurring coin
cost and a moral dial: a brutal corps keeps perfect order right up until it
beats someone to death and your reputation collapses.

---

## 6. Random Events

Probabilities are computed from live state, so mismanagement is *genuinely*
riskier. See [`src/core/events.ts`](../src/core/events.ts).

| Event | Driven by | Effect |
|---|---|---|
| **Riot** | avg unrest > 50 | Deaths (mitigated by guards), vents unrest, fatigues guards, reputation hit, repair costs |
| **Fire** | firewood hoard > 50 | Destroys food/wood, possible deaths |
| **Disease** | sanitation debt (too few buckets) | Population-wide health loss, deaths |
| **Escape** | high unrest + too few guards | Inmate flees (rep hit) or is recaptured |
| **Inspection** | random | Orderly keep → coin + reputation; squalor → fine |

Guard **mitigation** (skill + coverage) reduces the harm of riots, fires, and
escapes — the reason to keep enough well-paid warders.

### Decisions (pause-and-choose) — riot & bribe

The two most consequential events are **not** auto-resolved. They pause the day
and present the warden a choice with **telegraphed consequences** — the genre's
most-loved mechanic (Frostpunk's Book of Laws) and the direct antidote to its
most-hated failure (Reigns' opaque cause-and-effect). See
[docs/research/DIRECTIVES.md](./research/DIRECTIVES.md).

- **Riot** → *Crush it* (swift, bloody, reputation hit) · *Negotiate* (spend
  coin, spare lives) · *Let it burn out* (fortune decides).
- **Bribe** → *Pocket it* (coin now, scandal risk) · *Refuse* (reputation rises)
  · *Demand double* (greedy gamble).

Effects are deferred to the chosen option and applied deterministically
(`src/core/decisions.ts`), so outcomes are reproducible given (seed + choices).
Per design principle, the game **never scolds** the player for a valid choice —
consequences, not narration, are the verdict.

### Danger forecast (`src/core/danger.ts`)

The keep shows honest, growing/shrinking **risk bars** for the next day —
Riot, Fire, Sickness, Escape. These read from the *exact same probability
formulas the event engine rolls against* (`events.ts` imports `danger.ts`), so
the warning is trustworthy: what you see is the real chance. Implements research
directive #3 (telegraph danger the day before), turning unfair-feeling loss into
player-attributable loss.

Crucially the bars are **probabilities, not certainties** — the dice still roll.
A high bar can pass quietly; a low bar can still bite. So the player keeps making
hard calls on the fly rather than reading the future.

## 6a. Morality — the warden's soul (`src/core/morality.ts`)

A single scalar, **−100 (Tyrant) … 0 (Fair) … +100 (Saint)**, that the player
never sets directly. It drifts from how they treat inmates (crushing riots,
accepting bribes, employing brutal warders, letting inmates die of neglect push
it down; negotiating, refusing bribes, freeing inmates push it up). It is
deliberately **two-sided — neither extreme is strictly better**:

| | Cruel (Tyrant) | Kind (Saint) |
|---|---|---|
| Baseline unrest | **−** feared into order | **+** disrespect & agitation |
| Labour output | **+** worked harder | **−** they slack |
| Escape attempts | **−** terrified | **+** emboldened |
| Riot deadliness | **+** cornered violence | **−** calmer |
| Reputation on a death | **×1.4** (called a butcher) | **×0.6** (given benefit of doubt) |
| Reputation gains | **×0.6** (distrusted) | **×1.4** (beloved) |

So the classic bind: cruelty buys quiet, obedient, hard-working cells that turn
into a bloodbath the moment a riot erupts and stain your name with every death;
kindness wins public love and calm riots but breeds a lazy, disrespectful,
escape-prone population. The player finds their own point on the spectrum — and
lives with it. All couplings are pure multipliers (unit-tested).

---

## 7. Progression — Reputation Tiers

Reputation (0–100) unlocks four tiers, each opening a richer (and more
dangerous, more lucrative) intake pool:

| Tier | Rep | Title | Intake pool |
|---|---|---|---|
| Village | 0 | Village Gaoler | petty, violent |
| Town | 30 | Town Warden | + political |
| City | 55 | City Castellan | + noble |
| Crown | 80 | Crown Keeper | political, noble |

This is the long-arc goal stated in the original pitch: start as warden of a
small town, perform well, and the local then national government entrusts you
with ever more valuable prisoners and political figures.

---

## 8. Loss & Win Conditions — the run arc

- **Victory:** hold **Crown tier for 30 consecutive days** (a "Xd to glory"
  countdown badge appears in the HUD at Crown). The victory's *flavor* reflects
  the reign you actually ran (`src/core/endings.ts`):
  - **☠ The Iron Warden** — won as a Tyrant (morality ≤ −33)
  - **🕊 Shepherd of the Lost** — won as a Saint (morality ≥ +33)
  - **🪙 The Coin-Counter** — won rich (coin ≥ 1500)
  - **👑 Keeper of the Crown** — the default triumph
- **Loss — ⚖ Disgraced:** reputation hits 0. **Loss — 📜 Debtor's Walk:** coin
  below −100. Losses are themed endings too — per design principle the game
  narrates, never scolds.
- **The reign summary:** every ending shows "The Reign in Numbers" — days
  ruled, coin taken in, freed/deaths/escapes, riots faced, hard choices made,
  rarest inmate held, peak reputation, final moral standing — with a
  **Save Summary** button that exports the screen as a shareable image (the
  research's organic-marketing loop). See
  [docs/img/reign-summary.png](img/reign-summary.png).

### The story deck (`src/core/storyDecisions.ts`)

Eight situational dilemmas join riot/bribe, each eligibility-gated to the
state of the keep and resolved with the same telegraphed-trade-off rules:
plague doctor at the gate · a caught ringleader · a noble's family visit · a
guard caught smuggling · the magistrate's "special treatment" order · a
starving village at the storehouse · a prisoner duel · an informant selling a
riot warning. At most one decision fires per day.

### Weather & realm events

Four auto events widen the day-to-day texture: **harsh winter** (firewood need
doubles for 3 days, ❄ HUD badge), **royal amnesty** (petty prisoners walk
free), **the famous bard** (reputation swing keyed to how the keep is run), and
**rat plague** (spoiled stores).

---

## 9. UX & Controls

- **One-handed, portrait, turn-based.** Tabs: **Keep / Offers / Market**, a
  persistent top HUD (resources + reputation + net daily ledger), and a single
  always-visible **End Day** commit button.
- **Legibility first:** colour-coded severity swatches, health (green) and
  unrest (red) bars on every inmate, a running **Chronicle** log, and a toast
  surfacing each day's headline event.
- **Touch targets** ≥ 64 design px (~44pt). Tap an inmate card to cycle its
  labour assignment.

See the verified screenshot: [`docs/img/keep-day6.png`](./img/keep-day6.png).

---

## 10. Art & Audio Direction

Full treatment in [ART_DIRECTION.md](./ART_DIRECTION.md). Summary: top-down 2D
pixel art (Stardew/Zelda perspective) for readability on small screens; warm
parchment-and-stone palette; chiptune-meets-lute ambience; diegetic event
stingers (riot bells, fire crackle). The v0.1 slice ships with clean
programmatic placeholder art wired to accept real pixel assets with zero logic
changes.

---

## 11. Monetization (planned, not in slice)

Target model: **premium-lite**. A generous free game, one-time IAP "Royal
Charter" unlock that removes the only ad (an optional rewarded "messenger" who
brings a bonus offer), plus optional cosmetic keep-skin packs. No energy timers,
no pay-to-win — those clash with the "every shortcut has a cost" pillar. To be
validated in soft launch.

---

## 12. Content & Feature Backlog (post-slice)

- Named **story prisoners** with multi-day quests and moral dilemmas.
- **Seasons/weather** scaling firewood need and disease.
- **Keep upgrades** beyond cells: infirmary (heals), chapel (lowers unrest),
  gallows (reputation vs. severity trade), walls (lowers escape).
- **Guard progression**: training, traits, loyalty, corruption.
- **Diplomacy**: choose which government faction to serve; reputation per
  faction.
- **Events as choices**: pause-and-decide event cards (accept the bribe? quell
  the riot brutally or fairly?).
- Audio, juice, haptics, achievements, cloud save, localization.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sim balance feels unfair or swingy | All numbers centralized in `balance.ts`; deterministic seeded RNG makes balancing reproducible and testable |
| Scope creep on a large pitch | Strict vertical-slice-first roadmap; every system has a thin but real home already |
| Mobile performance | Turn-based (no per-frame sim), tiny logic bundle, Phaser isolated in its own cache chunk |
| Theme (prison cruelty) reads as endorsing abuse | Framing as management trade-offs with reputation *punishing* brutality; tone is grim-medieval, not exploitative |
