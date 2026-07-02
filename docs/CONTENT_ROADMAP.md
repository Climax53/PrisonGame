# Content Gap Analysis & Roadmap — from prototype to professional indie game

> **Decision document.** Every gap below is judged against three tests:
> (1) does its absence read as "prototype" to a paying player, (2) does the
> player-sentiment research say it drives love/hate, (3) does the marketing
> research say it feeds discoverability. Verdicts are final; effort estimates
> assume current velocity.

## Where we honestly stand

The **simulation is professional** (deterministic core, 87 tests, machine-played
balance verification, save migrations, animated UI, decisions, rarity, danger
forecasting, morality). The **presentation and content volume are not**:
programmatic rectangles instead of art, zero audio, no tutorial, no ending, two
decision types, and no reason to start a second run. That's the gap between
"impressive prototype" and "professional indie game," and it is closable.

---

## Tier 0 — launch blockers (the game is not shippable without these)

### 1. Real pixel art — 📋 fully specified in [ART_AUDIO_SPEC.md](ART_AUDIO_SPEC.md); awaiting commissioning
**Verdict: commission a small pixel-art pack; do not attempt programmer art.**
Rectangles-with-emoji reads as prototype in the first screenshot — and the
marketing plan's engines (featuring, short-form, screenshots) are all *visual*.
Scope, deliberately minimal but complete:
- 32×32 tileset (stone floor/walls, cell bars, straw, torch, door) for a
  **living keep view** header panel that grows with `cellCapacity`
- Prisoner portraits: 6 severity×rarity archetype busts + palette swaps
- Guard portrait, warden portraits (see #6), resource/event icons to replace emoji
- Key art + icon (already budgeted in the marketing plan's $500 tier)
The UI layer was built for this: severity/rarity colors, cards, and bars stay;
sprites drop into the existing containers with zero core changes.

### 2. Audio — 📋 fully specified in [ART_AUDIO_SPEC.md](ART_AUDIO_SPEC.md); awaiting sourcing
Zero sound today; sound is half of "juice." Scope: one ambient medieval loop,
stingers (riot bell, fire crackle, coin clink, gate slam, quill scratch for
day-end), UI ticks. Implementation: Phaser audio + a "tap to begin" boot gate
(iOS requires a gesture anyway — already on the release checklist). Source:
licensed packs (~$50–100) — commissioning music is not worth it at this stage.

### 3. Onboarding — ✅ DONE (five-step skippable tour, shows once)
Research: opaque onboarding is the genre's #2 most-hated trait; we currently
explain nothing. Scope: a guided first three days — pinned tooltip sequence
(HUD → danger strip → offer → labour → End Day), one scripted gentle event, and
a "Warden's Handbook" reference screen. No unskippable cutscenes.

### 4. A run arc: endings + the reign summary — ✅ DONE (victory + 4 themed wins + 2 themed losses + exportable summary card)
The game is currently endless-with-losses; research says endgame emptiness
kills retention and *multiple endings* drive replay (Reigns/BitLife). Scope:
- **Victory:** sustain Crown tier 30 days → "Keeper of the Crown" ending
- **Themed endings** by how you got there: Tyrant ending, Saint ending,
  Merchant (coin-hoard) ending, plus the existing loss endings
- **Reign summary share card**: days ruled, coin earned, deaths, escapes, final
  morality, rarest inmate held — rendered as a save-able image. This doubles as
  the organic-marketing loop (screenshot-able runs) the research calls for.

### 5. Decision & event variety — ✅ DONE (8 story cards + 4 auto events shipped)
Two decision kinds is a proof of concept, not a game. Target for launch:
**10 decision cards** and **4 new auto events**. Locked list:
- Decisions: plague doctor's cure offer (coin vs. risk) · escape ringleader
  caught (execute/solitary/pardon) · noble's family visit (allow/deny/charge) ·
  guard caught smuggling (fire/flog/blackmail) · magistrate's "special
  treatment" order (comply/refuse) · starving village begs the storehouse
  (share/refuse) · prisoner duel challenge · informant offers riot warning
  (pay/ignore) — each with morality/rarity/danger couplings like riot/bribe
- Auto events: harsh winter (firewood ×2 for 3 days) · royal amnesty (forced
  releases) · famous bard visit (reputation swing by conditions) · rat plague
  (food loss, disease pressure)

---

## Tier 1 — the differentiation layer (first post-launch month, some pre-launch if time allows)

### 6. Unique playable wardens — ✅ DONE (7 classes, achievement unlocks, select carousel)
**Your instinct is validated by the research** (RimWorld storytellers = beloved
authorship; Reigns replay variety). Six selectable wardens, each a rules
modifier + portrait + one-line fantasy:
- **The Veteran** (+1 free guard, guards cost less; −intake pay)
- **The Confessor** (starts Saint-side; kind effects amplified)
- **The Butcher** (starts Tyrant-side; crush outcomes cheaper, rep penalties worse)
- **The Merchant** (better prices & bounties; reputation gains slower)
- **The Reformer** (releases give double reputation; labour yields less)
- **The Gambler** (rarity odds shifted up; danger randomness widened)
Unlock by achievement (e.g., Butcher unlocks after a Tyrant loss) — free
content-as-progression, zero pay-to-win.

### 7. Named story inmates — ✅ DONE (3 legends with multi-beat arcs)
Research directive #2 (the genre's #1 emotional driver) + rarity system already
built for it: legendary/mythic inmates arrive as **named characters with
3-step mini-arcs** (e.g., the Deposed Prince's escape plot; the Alchemist who
offers to brew cures; the Bishop whose execution the crown demands). Each is a
chain of the decision cards from #5 — the systems compose.

### 8. Warden identity & keep customization — ✅ DONE (names, 8 sigils × 8 banner colors, on HUD/summary)
The "account customization" ask, scoped to what matters: warden name, keep
name, heraldry pick (banner color + sigil) shown on the HUD, endings, and the
share card. Cosmetic keep skins become the IAP-adjacent cosmetics later.

### 9. Pacing modes ("The Crown's Whim") — ✅ DONE (slow/steady/chaos, mid-run switchable)
Research directive #8 (RimWorld storytellers): three modes — Steady / Slow
Build / Chaos — scaling event frequency & severity, changeable mid-run, no
penalty. Cheap: it's multipliers over `BALANCE.events`.

### 10. Platform-native polish — 🟧 haptics DONE; local achievements DONE (Game Center/Play Games wiring at store setup)
Haptics on riot/fire/decision; Game Center + Play Games achievements
("Survive 100 days", "Hold a mythic", "Reach Saint & Tyrant"); leaderboard
(longest reign). Apple's featuring rubric explicitly rewards native adoption.

---

## Tier 2 — sustain & scale (post-launch live beats; each is a featuring/In-App-Event hook)

- **Seasons & weather** (winter firewood pressure, summer disease) — recurring
  content beat
- ~~Keep upgrades as buildings~~ ✅ DONE (infirmary, chapel, gallows, walls)
- ~~Daily seed challenge~~ ✅ DONE (date-seeded, one attempt/day, fixed loadout)
- **iCloud/cloud save**, localization (DE/FR/ES/BR-PT/JA — matches the
  marketing plan's store-metadata localization)
- **"Warden's Pardon" IAP** (~$5): unlocks cosmetic heraldry set + supporter
  badge + nothing gameplay-gated — per the monetization research
- iPad layout as an update beat

## Explicit non-goals (deciding what NOT to build)
- **No multiplayer/PvP** — wrong genre economics, invites pay-to-win pressure
- **No energy timers, gacha, or ad-based anything** — the research's clearest
  revolt triggers; fair monetization IS our positioning
- **No 3D/isometric art pivot** — top-down readability was a deliberate,
  research-backed call
- **No open-world prison walking sim** — the day-cycle card/roster format is
  the game; depth comes from systems, not camera

## Sequencing summary

```
Pre-launch  : Tier 0 (art → audio → onboarding → endings → content) + #6 wardens if schedule allows
Launch      : with marketing runbook (see MARKETING_PLAN.md)
Weeks 1–4   : Tier 1 remainder (story inmates, customization, pacing, native polish)
Months 2+   : Tier 2 beats, one per 3–4 weeks, each an In-App Event + featuring nomination
```
