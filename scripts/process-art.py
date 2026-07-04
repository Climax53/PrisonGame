#!/usr/bin/env python3
"""
Warden's Keep — art master → game-ready asset pipeline.

Input:  assets/art/*.png            (1024px+ masters, committed by the artist)
Output: public/art/*.webp           (optimized, alpha-recovered, game-sized)
        src/ui/artManifest.ts       (generated manifest the loader imports)

The masters were delivered as RGB PNGs with a *rendered* checkerboard where
transparency was intended. This pipeline reconstructs true alpha:

  1. Detect the checker pattern (cell size, phase, the two near-white colors)
     from the image border.
  2. Pass A: flood-fill from the border across checker-matching pixels
     (definite background).
  3. Pass B: pattern-match interior regions (e.g. the enclosed centers of the
     rarity frames) and accept large, high-confidence checker regions that the
     flood cannot reach.

VFX strips are sliced into uniform frames by alpha-projection so Phaser can
play them as spritesheets. Anything that fails slicing cleanly is emitted as
a still instead (no force-fitting).

Run from the repo root:  python3 scripts/process-art.py
Idempotent; deletes and regenerates public/art.
"""

import json
import os
import shutil
import sys
from collections import deque

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/art"
OUT = "public/art"
MANIFEST_TS = "src/ui/artManifest.ts"

WEBP_Q = 82  # painterly art survives 80+ without visible banding


# ── Checker detection & alpha recovery ───────────────────────────────────────

def is_checker_color(px):
    """Near-white, near-neutral — the two checker shades are ~254 and ~235."""
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return min(r, g, b) >= 208 and (max(r, g, b) - min(r, g, b)) <= 14


def detect_checker(arr):
    """Return (has_checker, cell, colors) judged from the border ring."""
    h, w, _ = arr.shape
    ring = np.concatenate([
        arr[2, :, :], arr[h - 3, :, :], arr[:, 2, :], arr[:, w - 3, :],
    ])
    checkerish = np.array([is_checker_color(p) for p in ring])
    if checkerish.mean() < 0.7:
        return False, 0, None
    # Estimate cell size from run lengths along the top border row.
    row = arr[2, :, :].astype(int)
    runs, run = [], 1
    for x in range(1, w):
        if abs(row[x] - row[x - 1]).max() <= 6:
            run += 1
        else:
            if run >= 4:
                runs.append(run)
            run = 1
    cell = int(np.median(runs)) if runs else 16
    cell = max(4, min(128, cell))
    return True, cell, None


def recover_alpha(im, punch_interior=False):
    """RGB master with rendered checker → RGBA with true transparency.
    Returns None if the image has no checker border (i.e. is full-bleed)."""
    arr = np.asarray(im.convert("RGB"))
    has, cell, _ = detect_checker(arr)
    if not has:
        return None
    h, w, _ = arr.shape
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    light = (np.minimum(np.minimum(r, g), b) >= 208) & (
        (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) <= 14
    )

    # Pass A — flood from the border across checker-matching pixels.
    bg = np.zeros((h, w), dtype=bool)
    seeds = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True
                seeds.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True
                seeds.append((y, x))
    # BFS via scipy: label the light-mask, keep components touching the border.
    labels, n = ndimage.label(light)
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)
    for lb in border_labels:
        bg |= labels == lb

    # Pass B — interior checker regions (frame centers, gaps in hair). A
    # checker region alternates its two shades by cell parity; genuine white
    # content (the dove, bone, parchment) does not. Test parity contrast so
    # real light-toned art is never punched out.
    yy, xx = np.mgrid[0:h, 0:w]
    lum = (r + g + b) / 3.0
    # The border-estimated cell size can misread (frames change the rhythm), so
    # test several candidate sizes and keep the strongest parity contrast.
    candidates = sorted({cell, cell // 2, cell * 2, 8, 16, 32, 64} - {0})
    parities = {c: (((xx // c) + (yy // c)) % 2 == 0) for c in candidates}
    for lb in range(1, n + 1):
        if lb in border_labels:
            continue
        comp = labels == lb
        size = int(comp.sum())
        if size < (h * w) * 0.0004:
            continue  # tiny speck — invisible either way, keep opaque
        # Frames etc.: any large enclosed light region IS the intended
        # transparent window, checker-rendered or flat white.
        if punch_interior and size >= (h * w) * 0.01:
            bg |= comp
            continue
        best = 0.0
        for c in candidates:
            even = lum[comp & parities[c]]
            odd = lum[comp & ~parities[c]]
            if len(even) < 8 or len(odd) < 8:
                continue
            best = max(best, abs(float(even.mean()) - float(odd.mean())))
        if best >= 5:
            bg |= comp  # alternates by cell parity → it is the checkerboard

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA")


def bbox_crop(im, pad=6):
    """Crop an RGBA image to its opaque content plus a small pad."""
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
    return im.crop((x0, y0, x1, y1))


# ── Emit helpers ─────────────────────────────────────────────────────────────

manifest = {}
report = {"cutout": [], "opaque": [], "anim": [], "skipped": [], "failed": []}


def save(key, img, fname):
    path = os.path.join(OUT, fname)
    img.save(path, "WEBP", quality=WEBP_Q, method=6)
    manifest[key] = {"file": fname, "w": img.width, "h": img.height}
    return path


def emit_cutout(key, src_file, target, square=False, punch_interior=False):
    """Checker-removed, bbox-cropped, resized so max dimension == target."""
    im = Image.open(os.path.join(SRC, src_file))
    rgba = recover_alpha(im, punch_interior=punch_interior)
    if rgba is None:
        report["failed"].append((src_file, "expected checker, found none"))
        return
    rgba = bbox_crop(rgba)
    if square:
        side = max(rgba.width, rgba.height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
        rgba = canvas
    scale = target / max(rgba.width, rgba.height)
    rgba = rgba.resize((max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))), Image.LANCZOS)
    save(key, rgba, f"{key}.webp")
    report["cutout"].append(key)


def emit_opaque(key, src_file, width, height=None, crop_aspect=None):
    """Full-bleed art: optional center-crop to aspect, then resize."""
    im = Image.open(os.path.join(SRC, src_file)).convert("RGB")
    if crop_aspect:
        target_ar = crop_aspect
        ar = im.width / im.height
        if ar > target_ar:  # too wide → crop sides
            new_w = round(im.height * target_ar)
            x0 = (im.width - new_w) // 2
            im = im.crop((x0, 0, x0 + new_w, im.height))
        else:  # too tall → crop top/bottom, biased slightly upward (skies matter)
            new_h = round(im.width / target_ar)
            y0 = (im.height - new_h) * 2 // 5
            im = im.crop((0, y0, im.width, y0 + new_h))
    if height is None:
        height = round(width * im.height / im.width)
    im = im.resize((width, height), Image.LANCZOS)
    save(key, im, f"{key}.webp")
    report["opaque"].append(key)


def emit_anim(key, src_file, cell_target):
    """Slice a checker-backed frame strip into a uniform-cell spritesheet.
    Falls back to a still of the best (largest) frame when slicing is dubious."""
    im = Image.open(os.path.join(SRC, src_file))
    rgba = recover_alpha(im)
    if rgba is None:
        report["failed"].append((src_file, "vfx: no checker found"))
        return
    a = np.asarray(rgba)[:, :, 3]

    def segments(profile, min_gap, min_seg):
        on = profile > profile.max() * 0.02
        segs, start = [], None
        for i, v in enumerate(on):
            if v and start is None:
                start = i
            elif not v and start is not None:
                if i - start >= min_seg:
                    segs.append((start, i))
                start = None
        if start is not None and len(on) - start >= min_seg:
            segs.append((start, len(on)))
        # merge segments separated by tiny gaps
        merged = []
        for s in segs:
            if merged and s[0] - merged[-1][1] < min_gap:
                merged[-1] = (merged[-1][0], s[1])
            else:
                merged.append(list(s))
        return [tuple(m) for m in merged]

    rows = segments(a.sum(axis=1), 8, 12)
    frames = []
    for (y0, y1) in rows:
        cols = segments(a[y0:y1].sum(axis=0), 8, 12)
        for (x0, x1) in cols:
            frames.append(bbox_crop(rgba.crop((x0, y0, x1, y1)), pad=2))

    if not (3 <= len(frames) <= 16):
        # Not a clean strip — ship the largest single frame as a still.
        best = max(frames, key=lambda f: f.width * f.height) if frames else bbox_crop(rgba)
        scale = cell_target / max(best.width, best.height)
        best = best.resize((max(1, round(best.width * scale)), max(1, round(best.height * scale))), Image.LANCZOS)
        save(key, best, f"{key}.webp")
        report["skipped"].append((key, f"sliced {len(frames)} frames → shipped still"))
        return

    cw = max(f.width for f in frames)
    ch = max(f.height for f in frames)
    scale = min(1.0, cell_target / max(cw, ch))
    cw, ch = round(cw * scale), round(ch * scale)
    sheet = Image.new("RGBA", (cw * len(frames), ch), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS)
        sheet.paste(f, (i * cw + (cw - f.width) // 2, ch - f.height))
    path = os.path.join(OUT, f"{key}.webp")
    sheet.save(path, "WEBP", quality=WEBP_Q, method=6)
    manifest[key] = {
        "file": f"{key}.webp", "w": sheet.width, "h": sheet.height,
        "frames": len(frames), "fw": cw, "fh": ch,
    }
    report["anim"].append((key, len(frames)))



def emit_poses(key, src_file, cell_target):
    """Slice a character body-sheet into individual figures (alpha blobs in
    reading order) and pack them into a uniform-cell spritesheet. The figures
    are hand-verified poses; anim frame indices live in src/ui/art.ts."""
    im = Image.open(os.path.join(SRC, src_file))
    rgba = recover_alpha(im)
    if rgba is None:
        report["failed"].append((src_file, "poses: no checker"))
        return
    a = np.asarray(rgba)[:, :, 3] > 8
    labels, n = ndimage.label(a)
    blobs = []
    for lb in range(1, n + 1):
        ys, xs = np.where(labels == lb)
        if len(xs) < (rgba.width * rgba.height) * 0.0008:
            continue
        blobs.append((int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())))
    blobs.sort(key=lambda b: (round(b[1] / 80), b[0]))
    frames = [rgba.crop((b[0], b[1], b[2] + 1, b[3] + 1)) for b in blobs]
    if len(frames) < 4:
        report["failed"].append((src_file, f"poses: only {len(frames)} figures"))
        return
    cw = max(f.width for f in frames)
    ch = max(f.height for f in frames)
    scale = min(1.0, cell_target / ch)
    cw, ch = round(cw * scale), round(ch * scale)
    sheet = Image.new("RGBA", (cw * len(frames), ch), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS)
        sheet.paste(f, (i * cw + (cw - f.width) // 2, ch - f.height))
    path = os.path.join(OUT, f"{key}.webp")
    sheet.save(path, "WEBP", quality=WEBP_Q, method=6)
    manifest[key] = {"file": f"{key}.webp", "w": sheet.width, "h": sheet.height,
                     "frames": len(frames), "fw": cw, "fh": ch}
    report["anim"].append((key, len(frames)))


# ── The catalogue ────────────────────────────────────────────────────────────

def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)

    # UI icons — 80px masters (display ≤40 logical px, crisp at 2× density).
    ICONS = {
        "anvil_market": "market", "axe_wood": None, "bell_inspection": None,
        "book_handbook": None, "bucket_cart_latrine": None, "bucket": None,
        "calendar_daily": None, "chapel": None, "coin": None, "crown": None,
        "dice": None, "dove": None, "firewood": None, "flame": None,
        "food_bread_meat": None, "gear": None, "hammer_smithy": None,
        "herald_trumpet_amnesty": None, "idle_dash": None, "infirmary_cross": None,
        "keep_tower": None, "ladder_escape": None, "lock": None, "lute_bard": None,
        "noose": None, "plague_rat": None, "population": None, "pot_kitchen": None,
        "prev_next_chevrons": None, "purse_bribe": None, "riot_fist": None,
        "scales_morality": None, "scroll_offers": None, "share_save": None,
        "skull": None, "snowflake": None, "trophy": None, "wall": None,
    }
    for name in ICONS:
        emit_cutout(f"icon_{name}", f"p0_ui_icon_{name}_v001.png", 80, square=True)
    for pip in ["common", "uncommon", "rare", "epic", "legendary", "doomed"]:
        key = "mythic" if pip == "doomed" else pip
        emit_cutout(f"pip_{key}", f"p0_ui_icon_{pip}_gem_pip_v001.png", 56, square=True)

    # Heraldry sigils — order MUST mirror SIGILS in src/core/identity.ts:
    # ["🦁","🐺","🦅","🐍","🌹","🔥","⚔","🗝"]
    for i, name in enumerate(["lion", "wolf", "eagle", "serpent", "rose", "flame", "crossed_swords", "key"]):
        emit_cutout(f"sigil_{i}", f"p0_heraldry_sigil_{name}_v001.png", 96, square=True)

    # Portraits.
    for wid in ["steward", "veteran", "confessor", "butcher", "merchant", "reformer", "gambler"]:
        emit_cutout(f"warden_{wid}", f"p0_warden_portrait_the_{wid}_v001.png", 384, square=True)
    emit_cutout("legend_deposedPrince", "p0_legend_portrait_prince_alaric_the_deposed_v001.png", 320, square=True)
    emit_cutout("legend_alchemist", "p0_legend_portrait_mirabel_the_alchemist_v001.png", 320, square=True)
    emit_cutout("legend_bishop", "p0_legend_portrait_bishop_odo_of_the_broken_cross_v001.png", 320, square=True)
    CAST = ["crown_inspector", "informant", "magistrate", "plague_doctor",
            "smuggler_guard", "the_bard", "veiled_noblewoman", "village_elder"]
    for c in CAST:
        emit_cutout(f"cast_{c}", f"p1_supporting_cast_{c}_v001.png", 320, square=True)

    # Prisoner portrait bases: severity × gender.
    BASES = {
        "petty_m": "petty_pickpocket_male", "petty_f": "petty_pickpocket_female",
        "violent_m": "violent_brawler_male", "violent_f": "violent_brawler_female",
        "political_m": "political_conspirator_male", "political_f": "political_conspirator_female",
        "noble_m": "fallen_noble_male", "noble_f": "fallen_noble_female",
    }
    for key, name in BASES.items():
        emit_cutout(f"base_{key}", f"p0_prisoner_portrait_base_{name}_v001.png", 224, square=True)
    for rar in ["common", "uncommon", "rare", "epic", "legendary", "doomed"]:
        key = "mythic" if rar == "doomed" else rar
        emit_cutout(f"frame_{key}", f"p0_prisoner_rarity_frame_{rar}_v001.png", 288, square=True, punch_interior=True)

    # Keep exteriors: 4 tiers × (day, dusk, night, winter) — 16:9 vista cards.
    TIERS = {
        "village": ("p0_keep_exterior_village_lock_up_v001.png", "village_lock_up"),
        "town": ("p0_keep_exterior_town_gaol_v001.png", "town_gaol"),
        "city": ("p0_keep_exterior_city_castellany_v001.png", "city_castellany"),
        "crown": ("p0_keep_exterior_crown_keep_v001.png", "crown_keep"),
    }
    for tier, (day_file, stem) in TIERS.items():
        emit_opaque(f"ext_{tier}_day", day_file, 1024, 576, crop_aspect=16 / 9)
        emit_opaque(f"ext_{tier}_dusk", f"p1_keep_exterior_variant_{stem}_dusk_v001.png", 1024, 576, crop_aspect=16 / 9)
        emit_opaque(f"ext_{tier}_night", f"p1_keep_exterior_variant_{stem}_night_torchlit_v001.png", 1024, 576, crop_aspect=16 / 9)
        emit_opaque(f"ext_{tier}_winter", f"p1_keep_exterior_variant_{stem}_winter_v001.png", 1024, 576, crop_aspect=16 / 9)

    # Decision banners: kind → art, cropped to a wide cinematic band.
    BANNERS = {
        "riot": "p0_event_banner_riot_v001.png",
        "bribe": "p0_event_banner_bribe_v001.png",
        "informant": "p1_event_banner_informant_at_the_bars_v001.png",
        "magistrateOrder": "p1_event_banner_magistrate_s_black_wax_letter_v001.png",
        "nobleVisit": "p1_event_banner_noble_visit_v001.png",
        "plagueDoctor": "p1_event_banner_plague_doctor_at_the_gate_v001.png",
        "ringleader": "p1_event_banner_ringleader_dragged_before_you_v001.png",
        "smuggler": "p1_event_banner_smuggler_guard_caught_v001.png",
        "starvingVillage": "p1_event_banner_starving_village_at_the_gate_v001.png",
        "duel": "p1_event_banner_yard_duel_circle_v001.png",
    }
    for kind, f in BANNERS.items():
        emit_opaque(f"banner_{kind}", f, 1328, 484, crop_aspect=1328 / 484)

    # Ending art — endingId → painting.
    ENDINGS = {
        "ironWarden": "p1_ending_art_iron_warden_v001.png",
        "shepherd": "p1_ending_art_shepherd_v001.png",
        "coinCounter": "p1_ending_art_coin_counter_v001.png",
        "crownKeeper": "p1_ending_art_crown_keeper_v001.png",
        "disgraced": "p1_ending_art_disgraced_v001.png",
        "bankrupt": "p1_ending_art_debtor_s_walk_v001.png",
    }
    for eid, f in ENDINGS.items():
        emit_opaque(f"end_{eid}", f, 768, 768, crop_aspect=1)

    # Tiles used by the Cells tab (full-bleed square scene tiles).
    TILES = ["stone_floor_plain", "stone_floor_cracked", "stone_floor_mossy",
             "snow_dusted_stone_floor", "cell_bars_door_open", "cell_bars_front",
             "straw_bedding", "hearth_lit"]
    for t in TILES:
        emit_opaque(f"tile_{t}", f"p0_keep_tileset_{t}_v001.png", 256, 256, crop_aspect=1)

    # Identity & store art.
    emit_cutout("logo", "p0_store_asset_logo_wordmark_carved_stone_v001.png", 840)
    emit_opaque("keyart", "p0_store_asset_key_art_master_v001.png", 640, 960, crop_aspect=2 / 3)
    # App icon: PNGs for the web head (favicon + apple-touch-icon).
    icon = Image.open(os.path.join(SRC, "p0_store_asset_app_icon_keep_gate_key_motif_v001.png")).convert("RGB")
    icon.resize((180, 180), Image.LANCZOS).save("public/apple-touch-icon.png")
    icon.resize((64, 64), Image.LANCZOS).save("public/favicon.png")

    # Character body-sheets — sliced into pose figures (walking guards etc.).
    emit_poses("sprite_guard", "p0_keep_sprite_guard_regular_body_sheet_v001.png", 120)
    emit_poses("sprite_prisoner", "p0_keep_sprite_prisoner_generic_body_sheet_v001.png", 120)

    # VFX — sliced to spritesheets where the strips are clean.
    emit_anim("vfx_fire_burst", "p0_vfx_fire_burst_v001.png", 160)
    emit_anim("vfx_coin_sparkle", "p0_vfx_coin_sparkle_burst_v001.png", 160)
    emit_anim("vfx_torch_flame", "p0_vfx_torch_flame_looping_v001.png", 120)
    emit_anim("vfx_smoke_puff", "p1_vfx_smoke_puff_v001.png", 160)
    # Snowfall: dark full-bleed sheet used with ADD blend (black → invisible).
    emit_opaque("vfx_snowfall", "p0_vfx_snowfall_overlay_v001.png", 512, 512, crop_aspect=1)

    # ── Manifest ──
    entries = ",\n".join(
        f'  {json.dumps(k)}: {json.dumps(v, separators=(",", ": "))}'
        for k, v in sorted(manifest.items())
    )
    ts = (
        "// GENERATED by scripts/process-art.py — do not edit by hand.\n"
        "// Maps logical art keys to files under public/art (served at ./art/).\n\n"
        "export interface ArtEntry {\n"
        "  file: string;\n  w: number;\n  h: number;\n"
        "  /** Present only for sliced animation strips. */\n"
        "  frames?: number;\n  fw?: number;\n  fh?: number;\n"
        "}\n\n"
        f"export const ART: Record<string, ArtEntry> = {{\n{entries},\n}};\n"
    )
    with open(MANIFEST_TS, "w") as f:
        f.write(ts)

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"\n=== {len(manifest)} assets → {total/1e6:.1f} MB in {OUT}")
    print(f"cutouts: {len(report['cutout'])}  opaque: {len(report['opaque'])}")
    print("anims:", report["anim"])
    print("skipped→still:", report["skipped"])
    if report["failed"]:
        print("FAILED:", report["failed"])
        sys.exit(1)


if __name__ == "__main__":
    main()
