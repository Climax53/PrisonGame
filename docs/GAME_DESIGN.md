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

Each inmate has: **severity**, **health** (0–100, death at 0), **unrest**
(0–100, fuels riots/escapes), **sentence** (days remaining → release on 0), and
a **labour assignment**.

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
| **Bribe** | a political/noble inmate present | Coin now, scandal risk to reputation |

Guard **mitigation** (skill + coverage) reduces the harm of riots, fires, and
escapes — the reason to keep enough well-paid warders.

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

## 8. Loss & Win Conditions

- **Loss — Disgraced:** reputation hits 0 (the magistrate strips your post).
- **Loss — Bankrupt:** coin falls below −100.
- **Soft win / endgame:** sustained Crown tier. v1 is an endless "how long can
  you reign / how high a score" run; a structured campaign with explicit
  victory chapters is a post-launch goal (see ROADMAP).

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
