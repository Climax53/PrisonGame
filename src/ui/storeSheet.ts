// ─────────────────────────────────────────────────────────────────────────────
// The Royal Mint — the in-game store sheet.
//
// Pure presentation over ui/store.ts (catalog + entitlement logic) and
// ui/payments.ts (the stubbed storefront adapter — nothing charges money).
// Crowns are EARNED through deeds and the daily challenge today; the purchase
// buttons surface honestly that the mint opens with the store builds.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import type { GameState } from "../core";
import { WARDENS } from "../core";
import { availableWardens, getProfile, persistProfile } from "./profile";
import {
  buyTheme,
  buyWardenUnlock,
  COIN_PER_CROWN,
  COIN_CONVERT_MIN,
  convertCrownsToCoin,
  CROWN_PACKS,
  setActiveTheme,
  THEMES,
  WARDEN_UNLOCK_COST,
} from "./store";
import { purchaseCrownPack } from "./payments";
import { COLORS, FONT, VIEW } from "./theme";
import { makeButton, makePanel } from "./widgets";

export interface StoreSheetHooks {
  /** Live run state, when a run is active (enables coin conversion). */
  state?: GameState;
  onChanged: () => void; // re-render + persist hooks in the scene
  toast: (msg: string, color?: string) => void;
}

export function openStoreSheet(scene: Phaser.Scene, hooks: StoreSheetHooks): void {
  const layer = scene.add.container(0, 0).setDepth(880);
  const close = () => {
    layer.destroy();
    hooks.onChanged();
  };

  const render = () => {
    layer.removeAll(true);
    const profile = getProfile();
    layer.add(
      scene.add
        .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.94)
        .setOrigin(0, 0)
        .setInteractive(),
    );
    const w = VIEW.width - 56;
    const h = VIEW.height - 120;
    const panel = makePanel(scene, 28, 60, w, h, "👑  The Royal Mint");
    panel.add(
      scene.add
        .text(w - 14, 12, `${profile.crowns} 👑`, {
          fontFamily: FONT.display,
          fontSize: "26px",
          color: COLORS.goldCss,
        })
        .setOrigin(1, 0),
    );
    let y = 46;
    panel.add(
      scene.add.text(14, y, "EARNING CROWNS — no purchase needed:", {
        fontFamily: FONT.medieval, fontSize: "16px", color: COLORS.goldCss,
      }),
    );
    y += 24;
    for (const line of [
      "🏆 Deeds (achievements) pay 10–25 👑 each — 195 👑 in total",
      "📅 The daily challenge pays 15 👑 every day you finish it",
      "🛒 Crown packs below arrive with the App Store release",
    ]) {
      panel.add(
        scene.add.text(20, y, line, {
          fontFamily: FONT.family, fontSize: "14px", color: COLORS.parchmentCss,
        }),
      );
      y += 22;
    }
    y += 6;

    // ── Crown packs (storefront stub — honest about not charging yet) ──
    const packW = (w - 28 - 16) / 3;
    CROWN_PACKS.forEach((p, i) => {
      const bx = 14 + i * (packW + 8);
      panel.add(
        makeButton(scene, {
          x: bx, y, width: packW, height: 64,
          label: `${p.crowns} 👑\n${p.priceUsd}`, fontSize: 15,
          onTap: () => {
            void purchaseCrownPack(p.id).then((r) => {
              if (!r.ok) hooks.toast(r.reason ?? "The mint is closed.", COLORS.goldCss);
              render();
            });
          },
        }),
      );
    });
    y += 76;

    // ── Keep themes (jail designs — cosmetic DLC) ──
    panel.add(
      scene.add.text(14, y, "Keep Themes", {
        fontFamily: FONT.display, fontSize: "22px", color: COLORS.goldCss,
      }),
    );
    y += 30;
    for (const t of THEMES) {
      const owned = profile.ownedThemes.includes(t.id);
      const active = profile.activeTheme === t.id;
      panel.add(
        scene.add.text(14, y + 4, `${t.name}`, {
          fontFamily: FONT.medieval, fontSize: "17px",
          color: active ? COLORS.goldCss : COLORS.parchmentCss,
        }),
      );
      panel.add(
        scene.add.text(14, y + 26, t.blurb, {
          fontFamily: FONT.family, fontSize: "12px", color: COLORS.neutralCss,
        }),
      );
      panel.add(
        makeButton(scene, {
          x: w - 132, y, width: 120, height: 40,
          label: active ? "✓ Active" : owned ? "Apply" : `${t.costCrowns} 👑`,
          fontSize: 15,
          fill: active ? COLORS.gold : COLORS.panelLight,
          textColor: active ? COLORS.inkCss : COLORS.parchmentCss,
          enabled: !active,
          onTap: () => {
            const res = owned ? setActiveTheme(profile, t.id) : buyTheme(profile, t.id);
            if (!res.ok) hooks.toast(res.error ?? "Cannot.", COLORS.badCss);
            else {
              persistProfile();
              hooks.toast(owned ? `${t.name} applied.` : `${t.name} acquired and applied.`, COLORS.goldCss);
            }
            render();
          },
        }),
      );
      y += 52;
    }

    // ── Warden shortcut unlocks ──
    panel.add(
      scene.add.text(14, y, "Wardens (every one earnable by deeds)", {
        fontFamily: FONT.display, fontSize: "22px", color: COLORS.goldCss,
      }),
    );
    y += 30;
    const avail = new Set(availableWardens());
    const locked = WARDENS.filter((wd) => !avail.has(wd.id));
    if (locked.length === 0) {
      panel.add(
        scene.add.text(14, y + 2, "The full roster stands unlocked. Well ruled.", {
          fontFamily: FONT.family, fontSize: "13px", color: COLORS.goodCss,
        }),
      );
      y += 26;
    }
    for (const wd of locked.slice(0, 3)) {
      panel.add(
        scene.add.text(14, y + 8, `${wd.glyph} ${wd.name}`, {
          fontFamily: FONT.medieval, fontSize: "16px", color: COLORS.parchmentCss,
        }),
      );
      panel.add(
        makeButton(scene, {
          x: w - 132, y, width: 120, height: 40,
          label: `${WARDEN_UNLOCK_COST} 👑`, fontSize: 15,
          enabled: profile.crowns >= WARDEN_UNLOCK_COST,
          onTap: () => {
            const res = buyWardenUnlock(profile, wd.id);
            if (!res.ok) hooks.toast(res.error ?? "Cannot.", COLORS.badCss);
            else {
              persistProfile();
              hooks.toast(`${wd.name} joins your service.`, COLORS.goldCss);
            }
            render();
          },
        }),
      );
      y += 48;
    }

    // ── Coin conversion into the current run ──
    if (hooks.state && !hooks.state.gameOver) {
      panel.add(
        scene.add.text(14, y, "War Chest", {
          fontFamily: FONT.display, fontSize: "22px", color: COLORS.goldCss,
        }),
      );
      y += 30;
      const crowns = COIN_CONVERT_MIN;
      const coin = crowns * COIN_PER_CROWN;
      panel.add(
        scene.add.text(14, y + 8, `Melt ${crowns} 👑 into ${coin} 🪙 for this reign`, {
          fontFamily: FONT.family, fontSize: "14px", color: COLORS.parchmentCss,
        }),
      );
      panel.add(
        makeButton(scene, {
          x: w - 132, y, width: 120, height: 40,
          label: "Melt", fontSize: 15,
          enabled: profile.crowns >= crowns,
          onTap: () => {
            const res = convertCrownsToCoin(profile, crowns);
            if (!res.ok || !hooks.state) {
              hooks.toast(res.error ?? "Cannot.", COLORS.badCss);
            } else {
              hooks.state.resources.coin += res.coin;
              persistProfile();
              hooks.toast(`+${res.coin} coin. The honest path is sweeter — but slower.`, COLORS.goldCss);
            }
            render();
          },
        }),
      );
      y += 50;
    }

    panel.add(
      makeButton(scene, {
        x: 14, y: h - 66, width: w - 28, height: 52,
        label: "Close", fontSize: 19,
        onTap: close,
      }),
    );
    layer.add(panel);
  };
  render();
}
