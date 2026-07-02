# Player Sentiment Research — Desktop Management / Prison / Colony Sims

> Design intelligence for *Warden's Keep*. Gathered by fanning web searches
> across Steam, Reddit, Metacritic, wikis, and journalism for **Prison
> Architect, RimWorld, Oxygen Not Included, Dwarf Fortress, Frostpunk, and
> Banished**. Steam/Metacritic user-review pages returned HTTP 403 to direct
> fetch; those claims rest on search-index summaries of the linked pages and are
> flagged inline. Sentiment corroborated across independent sources.

## 1. Most-loved mechanics

1. **Emergent, unscripted stories from simulation collision.** Players become
   author *and* audience — a PA murderer sets off a chain (mob fallout → riot →
   CEO death → succession). Ownership makes the story feel personal.
   (tvtropes.org PrisonArchitect; en.wikipedia.org/wiki/Dwarf_Fortress)
2. **Individual characters with names, histories, and needs.** RimWorld
   colonists / PA prisoners each have profiles and crime histories. Players stop
   seeing units and start seeing *people* — the emotional engine of the genre.
   (prisonarchitect.paradoxwikis.com/Prisoner; rimworldwiki.com/wiki/Social)
3. **Relationships & social bonds.** RimWorld colonists form rivalries and
   romances that affect mood and stability; a death matters more when two were
   lovers. (rimworldwiki.com/wiki/Social; unikolom.com/rimworld-relationships)
4. **Needs-satisfaction loop (welfare → performance).** In PA, meeting needs
   makes prisoners reform and reoffend less — a *legible* care→outcome chain.
   (prison-architect.fandom.com/wiki/Reform_Programs)
5. **Meaningful trade-off decisions (Frostpunk's Book of Laws).** Every law
   solves a crisis but costs Hope or raises Discontent — a *values* choice, not
   a math-optimal one. "Impossible in other media."
   (pcgamer.com frostpunk book-of-laws)
6. **Player-selectable pacing / storyteller.** RimWorld's Cassandra/Phoebe/Randy
   let players author their own tension curve, changeable mid-game.
   (rimworldwiki.com/wiki/AI_Storytellers)
7. **Creative sandbox construction / spatial expression.** Layout as a canvas
   that serves both min-maxer and roleplayer. (Steam PA reviews — index-sourced)
8. **Deep interlocking simulation that rewards mastery.** ONI: "insanely complex
   … rewards players who persist." Competence hard-won. (Metacritic ONI — idx)
9. **Chaotic emergency events (riots/escapes).** The rhythm shift from calm
   optimization to crisis firefighting. (prisonarchitect.paradoxwikis.com/Riots)
10. **Permadeath that makes consequences real.** DF's "Losing is Fun"; RimWorld
    players find permadeath makes "stories more interesting."
    (en.wikipedia.org/wiki/Dwarf_Fortress)

## 2. Most-hated / most-frustrating

1. **Punishing recovery loops — mistakes cost hours to fix.** ONI's loudest
   complaint: rebuilding is "tedious, repetitive… takes hours." The penalty is
   *boredom*, not challenge. (Metacritic ONI — index-sourced)
2. **Overwhelming complexity with poor onboarding.** ONI "requires an
   engineering degree or a YouTube deep-dive." Players fail without knowing why.
   (Steam ONI discussions — idx; gamefoundry.games colony-sims-for-beginners)
3. **Bad pathfinding / dumb AI.** PA inmates ignore near facilities for distant
   ones, forcing micromanagement. Breaks the competent-agent fantasy.
   (forums.introversion.co.uk viewtopic t=52760)
4. **Relentless pressure with no room to breathe.** ONI: "no time to relax."
   Perpetual crisis reads as stress, not tension. (Metacritic ONI — idx)
5. **Death-spirals — an early mistake quietly dooms a run hours later.**
   Frostpunk "punishes players for lack of knowledge." Invisible, delayed,
   unrecoverable failure feels like betrayal. (playeropinion.com frostpunk — idx)
6. **Moralizing endings that override player intent.** Frostpunk's "we crossed
   the line" backlash — a game that forces hard choices then *scolds* you for
   them invalidates agency. (Steam frostpunk discussions — idx)
7. **Endgame emptiness.** Banished: "no goals, no scenarios, no endgame." Once
   mastery is reached, nothing pulls you forward. (Metacritic Banished — idx;
   quartertothree.com Banished)
8. **Menu/UI clutter — everything in one undifferentiated list.** PA lists every
   object in one menu; hard to parse. Amplified on mobile. (pcgamer.com PA — idx)
9. **Repetitive expansion — "build it bigger."** Banished: nothing left "but
   expanding in the same fashion." (Metacritic Banished — idx)
10. **(Mobile) Predatory monetization.** Energy timers, forced ads, gacha,
    pay-to-win. Players *prefer* cosmetics, optional rewarded ads, one-time
    ad-removal. Highest-risk trap for us.
    (appfollow.io monetization-insights; devrant.com/rants/1542247)

## 3. What makes emergent stories memorable

- **Named agents + persistent history** (Boatmurdered spread across the web
  *because* the history was legible). Give inmates/guards names, rap sheets, and
  remembered events.
- **Systems that collide into causality chains** the player can narrate
  afterward (event → consequence → new event).
- **Relationships as amplifiers** — a consequence that ripples through a social
  web generates a story; one that stops at a stat does not.
- **The "unseen author"** — random-but-*reactive* pacing beats pure random.
- **You must be able to lose the story, not just win it.** Every retold DF tale
  ends in collapse; defeat is a celebrated ending.

## 4. Difficulty & failure — the verdict

- **Permadeath is beloved when consequences are the point.** Save-scumming
  "drains the game of meaning."
- **Players hate punishment that is delayed, invisible, or tedious to undo.**
  Failure should be *fast, legible, and interesting to recover from*.
- **Difficulty should be a player choice**, changeable mid-run.
- **Don't moralize forced choices** (the Frostpunk cautionary tale).
- **Failure must be attributable to the player** ("I should have built the
  patrol"), never to bad AI/opaque systems/unplannable RNG.

## 5. Eight directives for Warden's Keep

1. **Give every inmate a name, a crime, and a memory.** Reference them by name
   in the day-log. Cheap and high-impact on a turn-based mobile game.
2. **Ship a "day report" that narrates cause-and-effect.** The day-by-day
   structure is a gift: chain events into a short, screenshottable chronicle.
3. **Adopt the Frostpunk two-meter trade-off model — but never scold the
   player.** Dueling axes (Order vs. Mercy); decrees solve one problem at a cost
   to the other. Let consequences, not narration, be the verdict.
4. **Ship selectable pacing ("warden's fate") so players author difficulty.**
   2–3 modes, changeable mid-game, no penalty.
5. **Make the core loop welfare → outcome with a visible causal chain.** Tie
   needs (food/warmth/sanitation/safety) to concrete outcomes and add per-inmate
   reform tracks.
6. **Design failure to be FAST, LEGIBLE, and INTERESTING to recover from.**
   Telegraph danger the day before; make setbacks dramatic single-turn events;
   never a silent attrition spiral.
7. **Solve endgame-emptiness with escalating aspiration** — rising contract
   stakes, notorious named inmates, inspections, royal favor — each a *new
   decision type*, not bigger numbers.
8. **Monetize with cosmetics + optional rewarded ads — never energy timers,
   forced ads, or pay-to-win.**

*Full source list preserved in the project research notes; Steam/Metacritic
citations are index-sourced due to 403s on direct fetch.*
