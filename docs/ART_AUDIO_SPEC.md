# Warden's Keep — Complete Art & Audio Asset Specification

> **The commissioning document.** Every still image, animation, and sound the
> game needs to reach professional quality, with exact dimensions, frame
> counts, formats, and priorities. Hand the relevant section to an artist or
> sound designer as-is. Costs are indicative 2026 freelance ranges; nothing
> here obliges spending — the P0 column is the minimum shippable set, and the
> game runs today on placeholders.
>
> **Integration guarantee:** the UI was built for this swap. Every asset below
> maps to an existing code slot (noted per section); no simulation changes are
> required to adopt any of it.

---

## 0. Global art decisions (locked — artists must follow these)

| Decision | Value | Why |
|---|---|---|
| **Style** | 2D pixel art, "high-bit" (SNES-to-modern-indie register, à la Stardew/Wildermyth-pixel) | Matches references; readable at phone scale; commissionable |
| **Camera** | **Straight top-down for the keep view; ¾ front-facing for portraits; no isometric** | Locked in ART_DIRECTION.md — one-handed portrait readability |
| **Logical canvas** | 720 × 1280 portrait (Phaser FIT-scaled) | Already implemented |
| **Tile grid** | **32 × 32 px** | Standard, cheap, crisp at 2× |
| **Portrait sizes** | 96 × 96 px (roster/cards), 192 × 192 px (decision modals & select screens) | Two sizes only; artist draws at 192 and reduces |
| **Palette** | The shipped theme (`src/ui/theme.ts`): parchment `#e8d8b0`, panel woods `#2b2118/#3a2d20`, gold `#d9a441`, blood `#a83232`, moss `#6b8e4e`, steel `#8a94a0`, royal `#6a5acd` + rarity spectrum (`#9aa0a6 → #5fbf60 → #4d8fe0 → #a468e0 → #e0a43a → #e05a6a`) | Everything already on screen uses it; new art must harmonize |
| **Outline** | 1-px dark outline (`#0d0a07`), no anti-aliasing (hard pixels) | `pixelArt: true` renderer is already configured |
| **File format** | PNG-24 with alpha; animations as horizontal sprite-sheet strips + a JSON atlas (TexturePacker or free `phaser` atlas format); source files in Aseprite `.ase` | Drop-in for Phaser's loader |
| **Naming** | `category_name_variant_size.png` (e.g. `portrait_warden_butcher_192.png`, `anim_torch_32x32x6.png`) | Predictable loading code |
| **Delivery** | one repo folder `assets/art/` mirroring the section numbers below | — |

Suggested tools for the artist: Aseprite (drawing + animation), Lospec palette
export. Suggested commissioning venues: established pixel artists on
itch.io/X/Bluesky portfolios (not asset flips).

---

## 1. The Keep itself

### 1.1 Exterior — the "postcard" of your progress (stills, 4 states)

The keep exterior is the single most important image: it appears on the setup
screen, the victory/summary screen, and grows as you rise — the visible
progression payoff.

| Asset | Size | Qty | Notes |
|---|---|---|---|
| Keep exterior — **Village lock-up** | 640 × 360 | 1 | A sagging stone blockhouse, one torch, mud road. Straight-on ¾ "storybook elevation" view (NOT top-down — this is a vista card) |
| Keep exterior — **Town gaol** | 640 × 360 | 1 | Added wing, timber palisade, two towers |
| Keep exterior — **City castellany** | 640 × 360 | 1 | Curtain wall, gatehouse, banners (banner cloth uses **heraldry color layer** — see 1.4) |
| Keep exterior — **Crown keep** | 640 × 360 | 1 | Full castle silhouette, royal standard, mountain backdrop (echoes the player's reference image #1) |
| Day/night/winter variants | — | ×3 per state (12 total) | Same linework, palette swap layers: dusk, night-torchlit, snow-dressed (winter event reuses this) |

**Total: 4 base + 12 palette variants.** Code slot: setup screen header, summary
screen background, future loading screen. *(P0: the 4 base states; variants P1.)*

### 1.2 Interior — the living keep strip (top-down, modular tiles)

A horizontal "living keep" panel (720 × 200) drawn by the game from tiles, shown
atop the Keep tab, growing with `cellCapacity` and showing inmates/guards as
walking sprites. This is the biggest visual upgrade to moment-to-moment play.

**Tileset (32 × 32 each, one sheet):**

| Tile | Qty | Notes |
|---|---|---|
| Stone floor (plain / cracked / mossy / bloodstained) | 4 | bloodstain appears after riot deaths |
| Stone wall (straight, corner ×4, T-junction, torch-mounted) | 7 | |
| Cell bars (front, door-closed, door-open, broken) | 4 | broken = post-riot |
| Straw bedding / bucket / bench / table / barrel / crate | 6 | bucket ties to sanitation resource |
| Brazier / hearth (unlit + lit) | 2 | lit only when firewood > 0 — legible resource feedback |
| Infirmary cot, chapel altar+candles, gallows platform, wall-crenellation | 4 | appear when each **building** is constructed |
| Snow-dusted floor + ice window variants | 3 | winter event |
| Door, stairs, window (day/night) | 4 | |

**Total: ~34 tiles.** *(P0 in full — this is the core look.)*

### 1.3 Keep-view character sprites (animated, top-down)

| Sprite | Size | Animations × frames | Notes |
|---|---|---|---|
| Prisoner (generic body) | 32 × 32 | idle-sit ×2, walk ×4 (×4 directions), work ×4, agitated-pace ×4, collapse ×3 | **One body, 6 palette-swap tunic colors** keyed to severity/rarity — no unique bodies needed |
| Guard | 32 × 32 | idle ×2, patrol-walk ×4 (×4 dir), alert ×2, strike ×3 | 1 body, 2 palette variants (regular/veteran) |
| Rat (rat-plague event) | 16 × 16 | scurry ×4 | swarm-spawned |
| Plague doctor visitor | 32 × 32 | walk ×4 | cameo during that decision card |

**Total: 4 sprite bodies, ≈ 60 unique frames.** *(P0: prisoner + guard; P1: cameos.)*

### 1.4 Heraldry system (layered stills)

| Asset | Size | Qty |
|---|---|---|
| Banner cloth (recolorable white master — tint applied in code from `BANNER_COLORS`, already 8 colors) | 32 × 48 | 1 |
| Sigil glyphs (lion, wolf, eagle, serpent, rose, flame, swords, key — replaces the 8 emoji in `SIGILS`) | 24 × 24 | 8 |
| Banner flutter animation | 32 × 48 | ×4 frames | 

Code slot: HUD title, setup screen, summary card, keep-view flagpoles. *(P0.)*

---

## 2. Characters — portraits (stills, ¾ view busts)

### 2.1 The seven wardens (select screen + HUD + endings)

One 192 × 192 portrait each, on transparent background, waist-up, strong
silhouette. These are the game's "cover cast" — highest craft priority.

| Warden | Brief for the artist |
|---|---|
| **The Steward** | Middle-aged, plain wool + the keep's key ring; honest, tired eyes |
| **The Veteran** | Scarred, grey-bearded soldier; dented breastplate over gambeson |
| **The Confessor** | Gaunt, kind; simple habit, prayer-rope; faint halo-warm rimlight |
| **The Butcher** | Heavy-set, leather apron, iron-studded gloves; face half-shadowed |
| **The Merchant** | Fur-trimmed robe, rings, ledger under arm; appraising smirk |
| **The Reformer** | Younger, ink-stained fingers, sheaf of release papers; earnest |
| **The Gambler** | Asymmetric grin, dice charm, patched finery; one raised brow |

Each also gets a **16 × 16 chip** (auto-reduced) for the HUD line. *(P0.)*

### 2.2 Prisoner portrait system (procedural cast)

Portraits at 96 × 96 for roster cards and offers. **System, not individuals**:

- **4 severity archetypes** (petty pickpocket · violent brawler · political
  conspirator · fallen noble) × **2 sexes** = **8 base busts**
- **Layered accessories** (artist delivers as separate layers): hood, scar,
  eyepatch, chains, fine collar, tattoo — 6 layers
- **Rarity treatment applied in code**: card frame + name tint already exist;
  add a subtle glow frame PNG per rarity tier — **6 frame overlays** (96 × 96)

Yields hundreds of distinct-looking inmates from 8 + 6 + 6 assets. *(P0.)*

### 2.3 The legends (bespoke portraits — these sell the game's stories)

192 × 192 each, plus a 96 × 96 reduction:

1. **Prince Alaric the Deposed** — threadbare royal blues, defiant chin
2. **Mirabel the Alchemist** — soot smudges, goggles up, delighted menace
3. **Bishop Odo of the Broken Cross** — cracked pectoral cross, serene steel

*(P0 — they anchor the marketing clips.)* Future legends: +1 portrait each.

### 2.4 Supporting cast (decision cards, 96 × 96)

Magistrate · plague doctor · veiled noblewoman · village elder · informant ·
smuggler guard · crown inspector · the bard. **8 busts.** *(P1 — cards work
text-only today.)*

---

## 3. UI icon set (stills — replaces every emoji)

24 × 24 px, 1-px outline, on the parchment palette. Current emoji → icon:

| Group | Icons | Qty |
|---|---|---|
| Resources | coin, food (bread/meat), firewood, bucket, population | 5 |
| Tabs | keep tower, scroll (offers), anvil (market) | 3 |
| Labour | axe (wood), pot (kitchen), bucket-cart (latrine), hammer (smithy), idle dash | 5 |
| Dangers | riot fist, flame, plague rat, ladder-escape | 4 |
| Events | bell (inspection), purse (bribe), snowflake, herald trumpet (amnesty), lute (bard), crown, skull, dove, scales (morality) | 9 |
| Buildings | infirmary cross, chapel, noose, wall | 4 |
| Meta | gear, trophy, dice, calendar (daily), lock, book (handbook), share/save, prev/next chevrons | 8 |
| Rarity pips | 6 gem shapes (one per tier, in tier colors) | 6 |

**Total: 44 icons.** Code slot: direct string→texture swap in HUD/cards/market. *(P0.)*

---

## 4. Decision & event card illustrations (stills)

Wide "event banner" art shown at the top of the decision modal. 640 × 240,
painterly-pixel, dark vignette edges (reference image #3's mood).

| Card | P |
|---|---|
| Riot (cells erupting, torchlight) | **P0** |
| Bribe (purse through bars) | **P0** |
| Plague doctor at the gate | P1 |
| Ringleader dragged before you | P1 |
| Noble visit (veiled lady, escort) | P1 |
| Smuggler guard caught | P1 |
| Magistrate's black-wax letter | P1 |
| Starving village at the gate | P1 |
| Yard duel circle | P1 |
| Informant at the bars | P1 |
| Legend beats: 3 legends × 3 beats (9) — can reuse legend portrait + banner background | P2 |
| Auto events: winter, amnesty, bard, rat plague, fire, gaol-fever, escape, inspection (8 smaller 320 × 120 strips) | P2 |

**Total: 2 P0 + 8 P1 + 17 P2 = 27 illustrations.**

---

## 5. Endings, key art & store assets (stills)

| Asset | Size | Qty | Notes |
|---|---|---|---|
| Ending vignettes — Iron Warden / Shepherd / Coin-Counter / Crown Keeper / Disgraced / Debtor's Walk | 640 × 360 | 6 | summary-screen headers; double as shareable-card art |
| **Key art (master)** | 4096 × 4096 painterly-pixel | 1 | warden silhouette before torchlit keep; source for everything below |
| App icon | 1024 × 1024 (+ auto-generated sizes via `@capacitor/assets`) | 1 | must read at 60 px: suggest keep-gate + key motif |
| App Store screenshots frame set (device-framed, captioned) | 1290 × 2796 | 6–8 layouts | captions per MARKETING_PLAN §store page |
| Feature banner (Play Store) | 1024 × 500 | 1 | |
| App preview video end-card | 1080 × 1920 | 1 | logo + "No ads. No timers." |
| Logo/wordmark ("Warden's Keep" carved-stone lettering) | vector + 512 px PNG | 1 | |

*(Key art, icon, logo = **P0** — they gate the store listing. Ending vignettes P1.)*

---

## 6. Animations & VFX (sprite-sheet effects for the juice layer)

The tween system (bars, floats, shakes) already exists; these are the sprite
effects it can spawn. All 32 × 32 or 64 × 64 strips unless noted.

| Effect | Frames | Used by |
|---|---|---|
| Torch flame (looping) | 6 | keep view, modal edges |
| Hearth fire (looping) | 6 | keep view |
| Smoke puff | 8 | fire event, alchemist bang |
| Fire burst 64 × 64 | 10 | fire event flash |
| Coin sparkle / coin-burst fountain | 6 / 12 | income, bounty, bribe |
| Dust/rubble burst | 8 | riot resolution |
| Snowfall overlay (full-width particle sheet) | 8 | winter |
| Rain overlay (optional weather flavor) | 8 | P2 |
| Rat scurry (reuses 1.3 rat) | — | rat plague |
| Quill scribble 48 × 48 | 6 | day-end log writing |
| Bell swing 32 × 48 | 6 | inspection |
| Achievement laurel burst 96 × 96 | 10 | achievement toast |
| Victory confetti/petals full-screen sheet | 12 | victory screen |
| Skull wisp 48 × 48 | 8 | death moments |
| Banner flutter (from 1.4) | 4 | HUD/keep |
| Modal "card flip/unfurl" scroll edges 720 × 32 | 6 | decision modal open |

**Total: 16 effects, ≈ 120 frames.** *(P0: torch, fire burst, coin, dust, snow,
laurel; rest P1/P2.)*

**Explicit non-animations** (tweens already handle these — do NOT commission):
bar fills, number pops, screen shake/flash, tab slides, day wipe, button
presses, morality needle.

---

## 7. Audio — complete sound design

Format: OGG Vorbis q5 + M4A fallback (iOS), 44.1 kHz. Loudness: music
−16 LUFS integrated, SFX peaks ≤ −3 dBFS, mixed to sit under music. All loops
seamless. Delivery: `assets/audio/{music,sfx,ambience}/`.

### 7.1 Music (loops unless noted)

| Track | Length | Brief | P |
|---|---|---|---|
| **Main theme / day loop** | 2:00–2:30 | Low lute + hand drum + drone; patient, scheming; "medieval desk job with teeth" | **P0** |
| Tension layer (stem, additive) | same grid | Adds taiko pulse + dissonant fiddle when riot risk ≥ high — implemented as a volume-crossfaded stem so it *rises with the danger bar* | P1 |
| Night/decision loop | 1:30 | Sparse: bowed psaltery, distant drips; under decision modals | P1 |
| Setup/menu loop | 1:00 | Solo hurdy-gurdy over wind | P1 |
| Victory fanfare (one-shot) | 0:12 | Horns + bell peal, resolves warm | **P0** |
| Defeat lament (one-shot) | 0:10 | Solo low whistle over wind | **P0** |
| Winter variant of day loop (stem: high glassy strings) | — | winter event | P2 |

### 7.2 SFX — event & simulation (one-shots)

| Sound | Brief | P |
|---|---|---|
| Riot eruption | crowd roar + clashing metal + bell alarm, 2 s | **P0** |
| Riot crushed | truncheon impacts + abrupt silence | P1 |
| Fire alarm | crackle swelling + timber crack | **P0** |
| Gaol-fever | wet coughs ×3 variants | P1 |
| Escape attempt | scrabbling stone + guard whistle | P1 |
| Escape success | rope drop + running feet fading | P1 |
| Inspection | horse halt + paper unroll | P1 |
| Bribe | soft coin-purse slide | **P0** |
| Coin income (day end) | coin pour, 3 sizes (small/med/large by amount) | **P0** |
| Death toll | single low bell | **P0** |
| Release/freedom | gate creak + light chord | **P0** |
| Winter onset | wind howl + ice crack | P1 |
| Amnesty | herald trumpet | P1 |
| Bard (good/bad) | lute flourish ↑ / sour note ↓ | P1 |
| Rat plague | squeaks + grain spill | P1 |
| Duel | two hits + crowd "ohh" | P2 |
| Alchemy bang | muffled boom + glass | P2 |
| Gallows build | hammer ×3 + rope creak | P2 |
| Each building complete | masonry thud + chisel | P1 |
| Legend arrival sting | short mysterious motif (one per legend ×3) | P2 |

### 7.3 SFX — UI (one-shots, all ≤ 200 ms except noted)

| Sound | Brief | P |
|---|---|---|
| Button tap | wood tick | **P0** |
| Tab switch | page turn whisper | **P0** |
| End Day commit | heavy ledger thump + quill scratch (400 ms) | **P0** |
| Decision modal open | parchment unfurl | **P0** |
| Decision choose | wax-seal press | **P0** |
| Toast appear | soft chime | P1 |
| Achievement | small bell arpeggio | **P0** |
| Purchase | single coin click | **P0** |
| Error/blocked | dull knock | **P0** |
| Pager/carousel flick | card slide | P1 |
| Victory screen open | (fanfare covers it) | — |
| Reduced-audio note | ALL audio behind a settings toggle + the existing tap-to-start gate (iOS WebAudio requirement, already on the release checklist) | — |

### 7.4 Ambience beds (looping, quiet, layered under music)

| Bed | Brief | P |
|---|---|---|
| Keep interior | torch crackle, distant chain clinks, stone room tone | **P0** |
| Cells restless (fades in with avg unrest) | murmurs, cup-on-bars, coughs | P1 |
| Weather: wind / winter blizzard | — | P1 |
| Yard birds (calm mornings, kind-warden flavor) | — | P2 |

**Audio totals: 7 music pieces, ~34 SFX, 4 ambience beds.**
Sourcing: a single freelance composer/sound-designer bundle, or curated packs
(Sonniss GDC bundles are license-friendly) + a commissioned main theme.

---

## 8. Priorities & indicative budget

| Phase | Contents | Indicative cost (freelance, 2026) |
|---|---|---|
| **P0 — "looks & sounds shipped"** | tileset, keep sprites, 4 exteriors, 7 warden portraits, prisoner portrait system, 3 legend portraits, 44 icons, heraldry, 2 card banners, key art + icon + logo, 6 P0 VFX, main theme + 2 stingers + 12 P0 SFX + interior ambience | art $1,200–2,500 · audio $300–700 |
| **P1 — depth** | exterior variants, 8 supporting busts, 8 card banners, ending vignettes, remaining VFX, tension stem + night/menu loops + P1 SFX/ambience | art $800–1,500 · audio $250–500 |
| **P2 — luxury** | legend beat art, event strips, weather, remaining SFX/stems | $500–1,000 |

Cheaper paths that stay professional: license a cohesive medieval pixel pack
for tiles/VFX (~$50–150) and commission only portraits + key art (the
identity-bearing 30%); use curated SFX packs and commission only the theme.

## 9. Integration map (for whoever wires it in)

- Portraits → `buildPrisonerCard` / offers / setup carousel / HUD chip
- Icons → replace emoji strings in `GameScene`, `setup.ts`, `onboarding.ts`
- Tileset + keep sprites → new `KeepView` container atop the Keep tab (render-only)
- Card banners → decision modal header slot
- VFX sheets → `Juice` gains `playSheet(key, x, y)` (10 lines)
- Audio → Phaser sound manager behind the tap-to-start gate; danger-stem
  crossfade reads `assessDangers()` — the forecast already exposes it
- Everything loads through one `preload()` manifest; missing files fall back
  to current placeholders, so art can land incrementally
