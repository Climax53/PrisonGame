# Asset Report — Round 1 Usage Breakdown & Round 3 Master Request List

*Written July 2026, after the World-Class Pass. Companion to
`ART_ROUND2_REQUESTS.md` (rework specifics) and `ART_AUDIO_SPEC.md` (original
commissioning spec). This is the complete accounting the studio asked for.*

---

## Part 1 — What happened to every one of the 225 delivered files

### ✅ USED IN THE LIVE GAME — 131 game-ready assets from 143 masters

| Class | Masters | Where they live in the game |
|---|---|---|
| UI icons (44) | `p0_ui_icon_*` | HUD resource chips + forecast row, tab bar, danger bars, morality scales, labour badges & dossier picker, Market buildings/provisions, settings gear |
| Rarity gem pips (6) | `p0_ui_icon_*_gem_pip` | Offers dispatches, prisoner dossier ("doomed" pip serves our *mythic* tier) |
| Warden portraits (7) | `p0_warden_portrait_*` | New-reign carousel (with lock-tint for unearned wardens) |
| Prisoner bases (8) | `p0_prisoner_portrait_base_*` | Keep cards, Offers, the cell-block map, the dossier sheet — severity picks the character, a stable id-hash picks the gender variant |
| Rarity frames (6) | `p0_prisoner_rarity_frame_*` | Overlaid on every prisoner portrait (centers reconstructed to true alpha) |
| Legend portraits (3) | `p0_legend_portrait_*` | Front their story-beat decision modals |
| Supporting cast (8) | `p1_supporting_cast_*` | Magistrate opens every new reign (Letter of Appointment); the rest are staged for their story cards' future portrait slots |
| Keep exteriors (16) | `p0/p1_keep_exterior_*` | The living postcard: tier × (day/dusk/night/winter), driven by the real clock — also the DLC themes (Midnight Keep, Winterhold) |
| Event banners (10) | `p0/p1_event_banner_*` | Cinematic headers on all 10 decision kinds |
| Ending art (6) | `p1_ending_art_*` | Crown the reign summary, one per ending |
| Heraldry sigils (8) | `p0_heraldry_sigil_*` | Setup picker + HUD title, exact SIGILS order |
| Tiles (8 of 42) | floors ×4, bars ×2, straw, hearth | The jail map: corridor, cell floors (snow-dusted in winter), bars strips, straw bedding, the corridor hearth |
| VFX (5 of 13) | fire burst, coin sparkle, smoke puff, torch flame, snowfall | Sliced to spritesheets: fire events, coin gains, construction, postcard sconces, winter snow overlay |
| Store/identity (3) | app icon, logo wordmark, key art | Favicon + apple-touch-icon; carved-stone logo and key-art backdrop on setup |

### ⏸ DELIVERED FINE, PARKED FOR THEIR FEATURE — 46 masters (no artist action)

| Masters | Why parked |
|---|---|
| Remaining 34 tileset tiles (walls, corners, windows, doors, furniture, gallows/chapel/infirmary set pieces + all v002 variants) | They exist for the full **living-keep ambient strip** — which needs the walking-character sheets (below) to feel alive. The jail map uses the 8 that matter today. |
| All `v002` duplicates (21) | We standardized on v001 per asset for coherence; v002s are a ready-made variety pass for later. |
| `p1_store_asset_*` (screenshot frame, feature banner, video end card) | Store-listing production assets, not in-game art. Used when we cut store pages. |

### ❌ COULD NOT BE USED AS DELIVERED — 15 masters (re-commission specs in ART_ROUND2_REQUESTS.md)

| Masters | Why not (we do not force-fit) |
|---|---|
| 6 accessory layers ×2 versions (chains, eyepatch, collar, hood, scar, tattoo) | Drawn free-floating (tattoo arrived as a whole new bust); cannot align onto the 8 portrait bases. Need redraw ON the shared bust template. |
| 3 body sheets (guard, prisoner, plague doctor) | Pose grids are irregular — frames can't be machine-sliced. Need uniform 64×64 cells, 4×4 grid. |
| Heraldry banner cloth + flutter (2) | Awaits banner-cloth rendering; flutter needs uniform cells; cloth should be neutral grey for runtime tinting. |
| 8 of 13 VFX strips (bell, quill, skull wisp, scroll edges, hearth loop, laurel, dust, confetti, rat scurry) | Same irregular-grid issue or deferred; priority re-exports listed in round-2 doc. |

**Net: 143 used + 46 parked + 15 needing rework + 21 v002 spares = 225. Nothing lost, nothing force-fitted.**

---

## Part 2 — ROUND 3 MASTER REQUEST LIST (unlimited, per studio directive)

Everything below has a code slot waiting or specified. Format for ALL art:
PNG **with true alpha channel** (no rendered checkerboard), 1024×1024 unless
noted, matching the shipped palette/style. Priority: P0 = next drop, P1 =
following, P2 = when convenient.

### A. Characters & portraits (the biggest visual gap)

| # | Asset | Qty | Pri | Purpose |
|---|---|---|---|---|
| A1 | **Guard portraits** — recruit, veteran, enforcer, captain | 4 | P0 | Market roster, future guard dossier (guards are the last faceless population) |
| A2 | Guard portrait ELITE variants (rarity-styled: gilded captain, mythic "King's Blade") | 2 | P1 | Rare guard pulls deserve a face |
| A3 | **Prisoner base EXPANSION** — 2nd archetype per severity × gender (cutpurse/poacher, duelist/arsonist, heretic/spy, disgraced knight/fallen abbess) | 8 | P0 | Halves portrait repetition in a full 12-cell block |
| A4 | Elderly + young variant per severity (any gender) | 8 | P1 | Age variety; supports future "frail/young" traits |
| A5 | Accessory layers REDRAWN on the bust template (chains, eyepatch, hood, scar, collar, tattoo) + 4 new (branded cheek, bandage, monk's tonsure, noble's chain) | 10 | P0 | 20 bases × 10 accessories = 200 distinct faces |
| A6 | **Trait badges** (six 128px icons: lungs, fist, silver tongue, rope coil, clasped hands, anvil-back) | 6 | P0 | The new trait system shows text-only chips today |
| A7 | Warden portrait ANIMATED blink/idle sheets (uniform 2-frame, 384px cells) | 7 | P2 | Setup-screen life |
| A8 | The Magistrate — full-length version for the Letter of Appointment | 1 | P1 | The letter currently reuses the bust |

### B. The living keep & jail map

| # | Asset | Qty | Pri | Purpose |
|---|---|---|---|---|
| B1 | Walking sprite sheets re-exported on uniform 64×64 4×4 grids: prisoner, guard, plague doctor | 3 | P0 | Unlocks characters WALKING the jail-map corridor |
| B2 | New walkers: warden (player), rat pack, priest, noble visitor | 4 | P1 | Corridor life |
| B3 | **Corridor props with alpha**: standing torch, patrol brazier, water trough, chained ring, notice board, gallows shadow | 6 | P1 | Dress the map without full tiles |
| B4 | Cell DOOR sprite with alpha (closed/open/broken, front-facing bars only, no background) | 3 | P0 | True bars OVER occupants (today we slice the opaque tile) |
| B5 | Keep exterior for a 5th tier ("Royal Bastion" — post-victory prestige keep) ×4 phases | 4 | P2 | New-game+ hook |
| B6 | DLC theme exteriors: "Dungeon Deep" (torch-lit underground) and "Royal Annex" (white-stone luxury) ×4 tiers each | 8 | P1 | Two more sellable Keep Themes with art that doesn't reuse night/winter |

### C. Story & systems art

| # | Asset | Qty | Pri | Purpose |
|---|---|---|---|---|
| C1 | **Event banners for the 6 NEW story cards**: witch trial mob, tax assessor's ledger, gravedigger's cart, harvest festival, deathbed confession, rival warden's envoy (1536×512 wide crop like round 1) | 6 | P0 | New cards currently open bannerless |
| C2 | Banners: friar at the gate, crown audit, cell search (new auto events) | 3 | P1 | Event toast → chronicle vignettes |
| C3 | "No offers" empty-state vignette (empty dispatch table) | 1 | P1 | Last plain-text screen |
| C4 | First Decrees parchment checklist background (720×120, alpha edges) | 1 | P1 | FTUE strip polish |
| C5 | Crowns iconography: crown-coin icon, pouch/chest/vault pack art (3), "mint closed" seal | 5 | P0 | The Royal Mint sells with placeholder emoji today |
| C6 | Achievement medallion frame + 12 deed-specific medallion centers | 13 | P2 | Deeds ledger jewelry |
| C7 | Morale faces (content/weary/mutinous medallions) | 3 | P1 | Market roster emoji replacement |
| C8 | Barracks icon (bunk stack), Tavern tankard icon, sun & moon clock icons | 4 | P0 | Last emoji in the HUD/Market |

### D. AUDIO — the entire sensory layer is still open (game is silent)

Complete catalog; every hook already exists in code or is trivially added.
Format: OGG + M4A, -14 LUFS integrated, loops seamless.

**Music (7 pieces):**
| # | Piece | Length | Pri | Moment |
|---|---|---|---|---|
| D1 | Main theme "The Warden's March" — lute, hurdy-gurdy, frame drum | 90s loop | P0 | Setup screen + victory |
| D2 | Day-in-the-keep loop (calm, working rhythm) | 2–3min | P0 | Daylight hours |
| D3 | Tension stem (layered over D2 when any danger >60%) | 60s loop | P0 | Danger escalation — crossfade hook: `assessDangers()` |
| D4 | Night resolution sting → dawn motif | 20s | P0 | Retire for the Night |
| D5 | Decision-modal underscore (held drone, unresolved) | 45s loop | P1 | Any pending decision |
| D6 | Defeat lament / 4 victory fanfare variants | 5×15s | P1 | Endings |
| D7 | Winter re-orchestration of D2 (glass, wind) | 2min | P2 | Winter days |

**SFX (46):**
- UI (10): tab tap, button press, panel open/close, dossier open, coin spend, coin gain shimmer, error thunk, toast whoosh, tour page-turn — P0
- Economy & time (8): hourly coin drip (subtle!), payday pour, purchase chime, construction hammering, evening bell toll (the 9pm BELL — signature sound), dawn rooster+gate, sun-strip tick, crown mint chime — P0
- Keep life (12): cell door clang, keys jangle, patrol footsteps, prisoner mutter murmur bed (3 variants), straw rustle, hearth crackle, torch whoosh, bucket clank, forge hammer, kitchen pot, axe chop — P0/P1 (mutters pair with the new speech bubbles)
- Events & drama (16): riot eruption + quell, fire alarm + burst, disease cough bed, escape scramble + recapture, inspection trumpet, bribe purse, gallows drop (tasteful, offscreen), legend arrival motif ×3, achievement fanfare, letter seal break, witch-mob clamor, festival crowd — P1

**Ambience beds (4):** stone-hall room tone w/ distant drips (P0), courtyard birds/wind for day (P1), night crickets+owl (P1), blizzard (P2).

**Haptic-audio pairs:** the existing haptics (riot shake, achievement) should
gain matched audio one-shots — the code slots are the same `Juice` calls.

### E. Store & platform graphics (when accounts open)

Full Valve capsule ladder + Apple/Google screenshot sets as specified in
`ART_AUDIO_SPEC.md` §9a.3 — produced from round-1 key art + new screenshots;
plus 3 crown-pack store tiles (C5 doubles for IAP listing images).

---

**Grand totals requested for Round 3: ~120 art assets (≈40 P0) + 57 audio
assets (7 music, 46 SFX, 4 ambience).** Nothing here is speculative — every
line maps to a shipped system or a documented next feature.
