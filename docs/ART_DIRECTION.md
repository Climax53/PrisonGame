# Art & Audio Direction

Derived from the four reference images supplied at kickoff (medieval pixel-art
towns, a torch-lit stone interior, and an isometric fountain square).

## Verdict: top-down 2D pixel art

The reference set spans two perspectives — flat top-down (market/town) and
isometric (the dungeon interior, the fountain square). For a **one-handed phone
management sim**, top-down wins:

- **Readability on a 6" screen.** Top-down keeps cells, inmates, and bars
  legible at a glance; isometric depth eats vertical space and complicates
  touch targeting.
- **Cheaper, faster art pipeline.** No iso projection math, simpler animation,
  easier procedural cell layouts as the keep expands.
- **Still hits the fantasy.** The torch-lit stone, parchment UI, and warm wood
  tones from the references carry the medieval mood regardless of camera.

We keep the *mood* of the isometric references (the dungeon's torch glow, the
stained-glass warmth) as a lighting and palette target, not a camera.

## Palette (implemented in `src/ui/theme.ts`)

| Role | Hex | Use |
|---|---|---|
| Background | `#1a1410` | deep night-stone |
| Panel | `#2b2118` / `#3a2d20` | parchment-on-wood UI |
| Parchment | `#e8d8b0` | primary text |
| Gold | `#d9a441` | accents, reputation, headings |
| Blood | `#a83232` | danger, unrest, violent inmates |
| Moss | `#6b8e4e` | health, positive actions |
| Steel | `#8a94a0` | petty inmates, neutral metal |
| Royal | `#6a5acd` | political inmates |

Severity is colour-coded everywhere (swatches on cards and offers) so threat is
readable without reading.

## Asset plan (Phase 1)

Programmatic placeholders today map 1:1 to future sprites — **no logic changes
needed** to drop art in:

- **Tileset (32×32):** stone floor, straw, cell bars, doors, walls, torches.
- **Inmate sprites:** 4 severity silhouettes × idle/work/agitated states.
- **Guard sprites:** patrol/alert.
- **Resource & event icons:** replace the current emoji with crafted 1-bit-ish
  pixel icons for a consistent look.
- **Backdrops:** keep exterior that visibly grows with `cellCapacity` upgrades.

Recommended tooling: **Aseprite** for sprites/animation; pack with **TexturePacker**
or Phaser's atlas loader. Keep a single source `assets/sprites/` → exported atlas
in `public/`.

## Audio direction (Phase 1)

- **Ambience:** low lute + chiptune loop, sparse and grim.
- **Diegetic stingers:** riot bell, fire crackle, coughing (disease), coin
  clink (income), gate slam (intake).
- **UI:** soft wooden clicks; a heavier "thunk" on End Day.
- Tooling: **Howler.js** or Phaser's built-in WebAudio; keep all SFX < 200 ms
  for snappy feedback.

## Motion & juice (Phase 1)

Day-transition wipe, event flash + screen-shake on riots/fires, number pop-ups
on resource changes, bar tween easing, and device haptics on major events.
The toast system in `GameScene` is the first piece of this already in place.
