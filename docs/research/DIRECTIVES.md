# Design Directives — synthesized from player-sentiment research

This is the actionable distillation of the two research reports
([desktop](./desktop-sim-sentiment.md), [mobile](./mobile-sim-sentiment.md))
into concrete directives for *Warden's Keep*, with implementation status. Both
independent studies converged on the same core lessons — a strong signal.

Legend: ✅ done · 🟧 partial · ⬜ planned

| # | Directive | Evidence (both reports agree where noted) | Status |
|---|-----------|--------|--------|
| 1 | **Trade-off decisions with *telegraphed* consequences; never scold the player.** | Frostpunk Book of Laws (most-praised); Reigns opacity (most-hated). **Both reports, #3.** | ✅ Riot & bribe decisions with per-option consequence hints; no moralizing narration |
| 2 | **Named inmates with crimes; day-log narrates cause-and-effect by name.** | RimWorld/PA attachment; Banished's "cold undocumented emptiness". Desktop #1–2. | 🟧 Inmates named + Chronicle log exists; per-inmate crime/portrait/memory ⬜ |
| 3 | **Failure fast, legible, interesting to recover from — telegraph danger the day before.** | ONI tedious rebuilds; Frostpunk invisible death-spirals. Desktop #6. | 🟧 Single-turn dramatic events + loss conditions; explicit "riot likely tomorrow" warning ⬜ |
| 4 | **Keep state legible in the thumb zone; primary action bottom-center ≥48px.** | Kingdom Two Crowns hid unit info; NN/G thumb-zone. Mobile #4. | ✅ Persistent HUD (coin/food/wood/buckets/pop/rep), full-width bottom End Day |
| 5 | **Juice: animate consequences so feedback is felt, not just read.** | "Meaningful consequences" loved across both; opacity hated. | ✅ Animated bars, floating numbers, day-wipe, screen-shake/flash on riots/fires |
| 6 | **Reduced-motion + accessibility (colorblind-safe, big targets).** | ≈4.5% colorblind; motion sensitivity; NN/G. Mobile UX. | ✅ Reduced-motion toggle (respects OS pref); severity uses label+color |
| 7 | **Undo for low-risk, honest confirm for irreversible (label the action, not Yes/No).** | uxmovement/NN-G destructive actions. Mobile #8. | ⬜ Planned for execute/release actions |
| 8 | **Selectable pacing ("warden's fate") so players author difficulty.** | RimWorld storyteller (beloved); Frostpunk fixed-difficulty (hated). Desktop #4. | ⬜ Planned — 2–3 event-frequency modes |
| 9 | **Welfare→outcome loop with per-inmate reform tracks; escalating aspiration to beat endgame-emptiness.** | PA reform loop; Banished emptiness. Desktop #5, #7. | 🟧 Welfare→unrest/health/riot chain live; reform tracks + contract ladder ⬜ |
| 10 | **Guard against chore-creep in requests — cap simultaneous, each carries a real trade-off.** | Frostpunk mobile "becomes a chore." Mobile #5. | ✅ (by design) One decision/day, each a genuine trade-off |
| 11 | **Premium-feel monetization: free core, one-time ~$5 ad-removal + cosmetics; optional generous rewarded ads; NO energy timers / gacha / P2W.** | Egg Inc goodwill; Fallout Shelter timer backlash. **Both reports.** | ⬜ Model chosen (GDD §11); implement in Phase 3 |
| 12 | **Retention from content & consequence (procedural variety, multiple endings), not notification nagging; notifications opt-in & diegetic.** | Reigns/BitLife replay; ~60% refuse pushes. Mobile #6–7. | 🟧 Procedural events + loss endings; multiple *win/ending* states + opt-in pushes ⬜ |

## What this research changed this cycle

- **Prioritized the decision system first.** It was the single point both studies
  agreed on most strongly (Frostpunk's most-loved mechanic; Reigns' most-hated
  failure was the *absence* of telegraphing). It is now built and tested.
- **Made every decision option state its consequence up-front** (directive #1),
  directly countering the Reigns opacity complaint.
- **Invested in juice** (directive #5) so consequences are *felt* — the research
  repeatedly ties emotional impact to legible, ownable outcomes.
- **Locked the monetization stance** against energy timers / gacha / P2W
  (directive #11) — the clearest "revolt trigger" for our exact enthusiast
  audience.

## Next-cycle priorities (research-ranked)

1. **Per-inmate identity** (crime, temperament, remembered grudges) + name-drop
   in the log — directive #2, the genre's #1 emotional driver.
2. **Danger telegraphing** ("Unrest critical — a riot is likely tomorrow") —
   directive #3, converts unfair-feeling loss into player-attributable loss.
3. **Selectable pacing modes** — directive #8.
4. **Undo/confirm on destructive actions** — directive #7.
