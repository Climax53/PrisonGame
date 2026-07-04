# Art Round 2 — Required Assets & Rework Requests

> Status after integrating the 225-file round-1 drop (July 2026). **131
> game-ready assets shipped** — icons, portraits, rarity frames, keep
> exteriors (4 tiers × 4 times of day), all 10 decision banners, all 6 ending
> paintings, sigils, tiles, logo, key art, and 4 sliced VFX animations are
> LIVE in the game. This file lists only what could **not** be used as
> delivered (nothing was force-fitted) and what is newly needed.
>
> **Format note for everything below:** deliver PNGs with a **true alpha
> channel** (File → Export with transparency), NOT a rendered checkerboard.
> Round 1's checkerboard backgrounds were recovered programmatically
> (scripts/process-art.py), but real alpha avoids edge fringing and lets us
> skip a lossy reconstruction step.

## A. Rework — delivered but not usable as-is

| # | Asset | Problem | What we need |
|---|---|---|---|
| A1 | `p0_prisoner_accessory_layer_*` (chains, eyepatch, fine collar, hood, scar, tattoo) | Drawn as free-floating objects (or, for the tattoo, as a complete new bust) — they cannot be composited onto the 8 portrait bases because positions/scales don't align | Redraw each accessory **on a transparent 1024×1024 canvas aligned to the shared bust template** used by the 8 bases (same head position, same shoulders). One file per accessory, alpha only where the accessory exists. Then layered variety costs nothing: 8 bases × 6 accessories = 48 looks |
| A2 | `p0_keep_sprite_guard_regular_body_sheet`, `p0_keep_sprite_prisoner_generic_body_sheet`, `p1_keep_sprite_plague_doctor_visitor_sheet` | Grids are irregular (pose sizes/spacings vary, rows drift) so frames cannot be auto-sliced into animation cells | Re-export as a **uniform grid**: fixed 64×64 px cells, 4 rows (walk down/left/right/up), 4 frames per row, transparent background, character feet anchored to the same baseline in every cell. These power the future "living keep" walking-sprites strip |
| A3 | `p0_heraldry_banner_cloth_recolorable_master` + `flutter_animation` | Usable only once we build banner-cloth rendering; flutter frames are irregular like A2 | Re-export flutter as uniform cells (6 frames, 128×256). Keep the cloth NEUTRAL light grey so runtime tinting to the 8 banner colours reads correctly |
| A4 | `p1_vfx_bell_swing`, `p1_vfx_quill_scribble`, `p1_vfx_skull_wisp`, `p1_vfx_modal_scroll_unfurl_edges`, `p1_vfx_hearth_fire_looping`, `p0_vfx_achievement_laurel_burst`, `p0_vfx_dust_rubble_burst`, `p1_vfx_victory_confetti_petals`, `p1_keep_sprite_rat_scurry_sheet` | Not yet integrated (fire/coin/smoke/torch/snow covered the launch moments); several have the same irregular-grid issue | When redelivering, use uniform cells as in A2. Priority order for round 2: laurel burst (achievements), confetti (victory), rat scurry (plague event), skull wisp (deaths) |

## B. New assets — gaps discovered during integration

| # | Asset | Why it's needed | Spec |
|---|---|---|---|
| B1 | **Guard portraits** (4) | Warders appear in the Market roster and will get their own management screen — prisoners are painted, guards are still text | 4 bust portraits on the shared template: young recruit, grizzled veteran, brutal enforcer, elite captain. 1024×1024, alpha. Rarity frames already work for them |
| B2 | **Barracks icon** | The Market's building list has painted icons for 5 of 6 buildings; barracks still uses an emoji | 1024×1024 icon, same style as `p0_ui_icon_*`: a wooden bunk / bedroll stack |
| B3 | **Tavern icon (tankard)** | Currently borrowing the dice icon; a tankard reads instantly | Same spec; foaming tankard, gold-on-parchment palette |
| B4 | **Moon/night icon + sun icon pair** | The HUD clock badge uses ☀/🌙 emoji next to painted icons | Two 1024×1024 icons matching the set |
| B5 | **Warder morale faces** (3) | Market roster shows 😊/😐/😠 emoji beside painted art | Three small face medallions (content/weary/mutinous), icon-style |
| B6 | **Empty-throne "no offers" vignette** | The Offers tab's empty state is plain text under painted neighbours | One 1536×1024 painting: an empty dispatch table, unlit candle, no messenger |
| B7 | **Chronicle parchment texture** | The log panel is flat; a subtle parchment backdrop would finish the keep screen | 720×400 tileable parchment, VERY low contrast (text must stay readable) |
| B8 | **App icon exports** | The painted icon now serves the web favicon + apple-touch-icon; store submissions need the full ladder | Re-export the existing `p0_store_asset_app_icon` master at 1024 flat PNG (no rounded corners — Apple applies its own mask) so `capacitor-assets` can generate every size |

## C. Round-1 assets shipped but awaiting their feature

These are good as delivered — parked until their feature lands (no artist action):

- Full wall/floor/furniture tileset (21 kinds × v001+v002) → the "living keep"
  ambient strip (needs A2's walking sprites to come alive).
- `p1_store_asset_*` (screenshot frame, feature banner, video end card) →
  store-listing production, not in-game.
- Exterior dusk/night/winter variants are LIVE; the tile ice-window /
  snow-threshold variants wait for the living-keep strip.

## D. Audio (unchanged)

Round 1 was art-only. The audio list in `ART_AUDIO_SPEC.md` §7 (main theme,
stingers, ambience beds, ~34 SFX) remains fully open and is now the biggest
missing sensory layer.
