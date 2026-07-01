// ─────────────────────────────────────────────────────────────────────────────
// GameScene — the playable vertical slice
//
// This scene is a *thin* view over the simulation core. It never contains game
// rules: it reads GameState, draws it, and routes taps to applyAction()/
// advanceDay(). Because it's tab-based and re-renders on every change, the code
// stays simple — turn-based games don't need a per-frame render loop.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import {
  advanceDay,
  applyAction,
  applyDecision,
  costs,
  createInitialState,
  livingPrisoners,
  summarize,
  type GameState,
  type LaborAssignment,
  type Prisoner,
} from "../core";
import { COLORS, FONT, VIEW } from "../ui/theme";
import { makeBar, makeButton, makePanel } from "../ui/widgets";
import { loadGame, saveGame } from "../ui/save";
import { Juice } from "../ui/fx";
import { getSettings, updateSettings } from "../ui/settings";

/** A resource/reputation snapshot used to animate deltas between renders. */
interface Vitals {
  coin: number;
  reputation: number;
}

type Tab = "keep" | "offers" | "market";

const LABOR_CYCLE: LaborAssignment[] = [
  "none",
  "woodcutting",
  "kitchen",
  "latrine",
  "smithy",
];

const LABOR_ICON: Record<LaborAssignment, string> = {
  none: "—",
  woodcutting: "🪓",
  kitchen: "🍲",
  latrine: "🪣",
  smithy: "🔨",
};

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private activeTab: Tab = "keep";
  private hud!: Phaser.GameObjects.Container;
  private content!: Phaser.GameObjects.Container;
  private modalLayer!: Phaser.GameObjects.Container;
  private toastText?: Phaser.GameObjects.Text;
  private juice!: Juice;
  /** Last drawn vitals, so bars/numbers can animate from the previous value. */
  private displayed: Vitals = { coin: 0, reputation: 0 };
  /** Screen position of the coin chip, for floating coin deltas. */
  private coinChip = { x: 72, y: 72 };
  private animateReputationFrom: number | null = null;

  constructor() {
    super("GameScene");
  }

  create(): void {
    // Resume a save if one exists; otherwise start fresh with a varied seed.
    // The seed is taken at the boundary (here, not in the core) so the core
    // stays deterministic for tests.
    const saved = loadGame();
    this.state = saved ?? createInitialState(this.makeSeed());

    this.cameras.main.setBackgroundColor(COLORS.bgCss);
    this.hud = this.add.container(0, 0);
    this.content = this.add.container(0, 0);
    this.modalLayer = this.add.container(0, 0).setDepth(800);
    this.juice = new Juice(this);
    this.displayed = { coin: this.state.resources.coin, reputation: this.state.reputation };
    this.renderAll();
  }

  /** A non-deterministic seed for new games (RNG itself stays seeded/pure). */
  private makeSeed(): number {
    // performance.now avoids the banned-in-core Date.now while still varying.
    return Math.floor(performance.now() * 1000) ^ 0x9e3779b9;
  }

  private renderAll(): void {
    this.renderHud();
    this.renderContent();
    this.renderModal();
  }

  private persist(): void {
    saveGame(this.state);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  private renderHud(): void {
    this.hud.removeAll(true);
    const s = this.state;
    const r = s.resources;
    const sum = summarize(s);

    // Top banner.
    const banner = this.add
      .rectangle(0, 0, VIEW.width, 150, COLORS.panel)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.gold, 0.5);
    this.hud.add(banner);

    const title = this.add.text(16, 12, `⚜ Warden's Keep`, {
      fontFamily: FONT.family,
      fontSize: "26px",
      color: COLORS.goldCss,
    });
    const tierLabel = this.add
      .text(VIEW.width - 58, 16, `${tierTitle(s.tier)}  •  Day ${s.day}`, {
        fontFamily: FONT.family,
        fontSize: "20px",
        color: COLORS.parchmentCss,
      })
      .setOrigin(1, 0);
    this.hud.add([title, tierLabel]);

    // Settings gear — toggles reduced motion (accessibility).
    this.hud.add(
      makeButton(this, {
        x: VIEW.width - 48,
        y: 8,
        width: 40,
        height: 40,
        label: "⚙",
        fontSize: 22,
        fill: COLORS.panelLight,
        onTap: () => {
          const next = !getSettings().reducedMotion;
          updateSettings({ reducedMotion: next });
          this.toast(`Reduced motion: ${next ? "ON" : "OFF"}`, COLORS.goldCss);
        },
      }),
    );

    // Resource row.
    const chips: Array<[string, string, string]> = [
      ["🪙", `${Math.round(r.coin)}`, COLORS.goldCss],
      ["🍖", `${round1(r.food)}`, COLORS.parchmentCss],
      ["🪵", `${round1(r.firewood)}`, COLORS.parchmentCss],
      ["🪣", `${round1(r.buckets)}`, COLORS.parchmentCss],
      ["👤", `${sum.living}/${s.cellCapacity}`, COLORS.parchmentCss],
    ];
    const chipW = VIEW.width / chips.length;
    chips.forEach(([icon, val, color], i) => {
      const t = this.add
        .text(i * chipW + chipW / 2, 64, `${icon}${val}`, {
          fontFamily: FONT.family,
          fontSize: "22px",
          color,
        })
        .setOrigin(0.5, 0);
      this.hud.add(t);
    });

    // Reputation bar — animates from the previously displayed value.
    this.hud.add(
      this.add.text(16, 104, "Reputation", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.neutralCss,
      }),
    );
    const repBar = makeBar(this, 16, 124, VIEW.width - 32, 16, s.reputation / 100, COLORS.gold);
    this.hud.add(repBar);
    if (this.animateReputationFrom !== null) {
      const fill = repBar.getData("fill") as Phaser.GameObjects.Rectangle;
      const full = repBar.getData("fullWidth") as number;
      this.juice.tweenBar(fill, this.animateReputationFrom / 100, s.reputation / 100, full);
      this.animateReputationFrom = null;
    }

    // Net daily ledger hint.
    const net = sum.dailyIncome - sum.dailyWages;
    this.hud.add(
      this.add
        .text(VIEW.width - 16, 100, `${net >= 0 ? "+" : ""}${net}/day`, {
          fontFamily: FONT.family,
          fontSize: "18px",
          color: net >= 0 ? COLORS.goodCss : COLORS.badCss,
        })
        .setOrigin(1, 0),
    );

    // Tab bar.
    const tabs: Array<[Tab, string]> = [
      ["keep", "🏰 Keep"],
      ["offers", `📜 Offers (${s.offers.length})`],
      ["market", "⚒ Market"],
    ];
    const tabW = VIEW.width / tabs.length;
    tabs.forEach(([tab, label], i) => {
      this.hud.add(
        makeButton(this, {
          x: i * tabW,
          y: 156,
          width: tabW,
          height: 56,
          label,
          fontSize: 20,
          fill: this.activeTab === tab ? COLORS.gold : COLORS.panelLight,
          textColor: this.activeTab === tab ? COLORS.inkCss : COLORS.parchmentCss,
          onTap: () => {
            if (this.activeTab === tab) return;
            this.activeTab = tab;
            this.renderAll();
            this.juice.slideIn(this.content);
          },
        }),
      );
    });
  }

  // ── Content ──────────────────────────────────────────────────────────────
  private renderContent(): void {
    this.content.removeAll(true);
    if (this.state.gameOver) {
      this.renderGameOver();
      return;
    }
    switch (this.activeTab) {
      case "keep":
        this.buildKeepTab();
        break;
      case "offers":
        this.buildOffersTab();
        break;
      case "market":
        this.buildMarketTab();
        break;
    }
    this.renderEndDayBar();
  }

  private contentTop = 228;
  private contentBottom = VIEW.height - 96;

  private buildKeepTab(): void {
    const s = this.state;
    const living = s.prisoners.filter((p) => p.alive);
    if (living.length === 0) {
      this.content.add(
        this.add
          .text(VIEW.width / 2, this.contentTop + 40, "The cells stand empty.\nAccept a prisoner from the Offers tab.", {
            fontFamily: FONT.family,
            fontSize: "22px",
            color: COLORS.neutralCss,
            align: "center",
          })
          .setOrigin(0.5, 0),
      );
      this.buildLogPanel(this.contentTop + 160);
      return;
    }

    this.content.add(
      this.add.text(16, this.contentTop, "Tap a prisoner to cycle their labour assignment:", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.neutralCss,
      }),
    );

    const cardH = 86;
    const startY = this.contentTop + 28;
    const maxRows = Math.floor((this.contentBottom - startY - 150) / (cardH + 8));
    living.slice(0, maxRows).forEach((p, i) => {
      this.content.add(this.buildPrisonerCard(p, 16, startY + i * (cardH + 8), VIEW.width - 32, cardH));
    });

    this.buildLogPanel(startY + Math.min(living.length, maxRows) * (cardH + 8) + 6);
  }

  private buildPrisonerCard(
    p: Prisoner,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Phaser.GameObjects.Container {
    const panel = makePanel(this, x, y, w, h);
    const sev = COLORS.severity[p.severity] ?? COLORS.steel;

    // Severity swatch.
    panel.add(this.add.rectangle(10, 10, 14, h - 20, sev).setOrigin(0, 0));

    panel.add(
      this.add.text(34, 10, `${p.name}`, {
        fontFamily: FONT.family,
        fontSize: "20px",
        color: COLORS.parchmentCss,
      }),
    );
    panel.add(
      this.add.text(34, 34, `${p.severity}  •  ${p.sentenceDays}d left`, {
        fontFamily: FONT.family,
        fontSize: "15px",
        color: COLORS.neutralCss,
      }),
    );

    // Health + unrest bars.
    panel.add(this.add.text(34, 56, "HP", { fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, 66, 58, 120, 12, p.health / 100, COLORS.good));
    panel.add(this.add.text(196, 56, "Unrest", { fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, 256, 58, 120, 12, p.unrest / 100, COLORS.bad));

    // Labour badge (the whole card is tappable to cycle it).
    panel.add(
      this.add
        .text(w - 16, h / 2, `${LABOR_ICON[p.assignment]} ${p.assignment}`, {
          fontFamily: FONT.family,
          fontSize: "18px",
          color: COLORS.goldCss,
        })
        .setOrigin(1, 0.5),
    );

    const hit = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => this.cycleLabor(p));
    panel.add(hit);
    return panel;
  }

  private cycleLabor(p: Prisoner): void {
    const idx = LABOR_CYCLE.indexOf(p.assignment);
    const next = LABOR_CYCLE[(idx + 1) % LABOR_CYCLE.length];
    applyAction(this.state, { type: "assignLabor", prisonerId: p.id, assignment: next });
    this.persist();
    this.renderContent();
  }

  private buildOffersTab(): void {
    const s = this.state;
    if (s.offers.length === 0) {
      this.content.add(
        this.add
          .text(VIEW.width / 2, this.contentTop + 40, "No offers right now.\nEnd the day to receive new prisoners.", {
            fontFamily: FONT.family,
            fontSize: "22px",
            color: COLORS.neutralCss,
            align: "center",
          })
          .setOrigin(0.5, 0),
      );
      return;
    }

    const full = livingPrisoners(s) >= s.cellCapacity;
    s.offers.forEach((offer, i) => {
      const y = this.contentTop + i * 168;
      const panel = makePanel(this, 16, y, VIEW.width - 32, 152, "Government Dispatch");
      const p = offer.prisoner;
      const sev = COLORS.severity[p.severity] ?? COLORS.steel;
      panel.add(this.add.rectangle(12, 40, 14, 96, sev).setOrigin(0, 0));
      panel.add(
        this.add.text(36, 40, `${p.name}`, {
          fontFamily: FONT.family,
          fontSize: "22px",
          color: COLORS.parchmentCss,
        }),
      );
      panel.add(
        this.add.text(36, 70, `${p.severity}  •  sentence ${p.sentenceDays}d`, {
          fontFamily: FONT.family,
          fontSize: "16px",
          color: COLORS.neutralCss,
        }),
      );
      panel.add(
        this.add.text(36, 96, `Pays ${offer.dailyPayout}/day  •  bounty +${offer.acceptBounty}`, {
          fontFamily: FONT.family,
          fontSize: "16px",
          color: COLORS.goldCss,
        }),
      );
      panel.add(
        makeButton(this, {
          x: VIEW.width - 32 - 230,
          y: 92,
          width: 110,
          height: 48,
          label: "Accept",
          fontSize: 18,
          fill: COLORS.moss,
          enabled: !full,
          onTap: () => this.doAction({ type: "acceptOffer", offerIndex: i }, "offers"),
        }),
      );
      panel.add(
        makeButton(this, {
          x: VIEW.width - 32 - 112,
          y: 92,
          width: 100,
          height: 48,
          label: "Decline",
          fontSize: 18,
          fill: COLORS.blood,
          onTap: () => this.doAction({ type: "declineOffer", offerIndex: i }, "offers"),
        }),
      );
      this.content.add(panel);
    });

    if (full) {
      this.content.add(
        this.add
          .text(VIEW.width / 2, this.contentTop + s.offers.length * 168 + 4, "⚠ Cells full — expand in the Market.", {
            fontFamily: FONT.family,
            fontSize: "16px",
            color: COLORS.badCss,
          })
          .setOrigin(0.5, 0),
      );
    }
  }

  private buildMarketTab(): void {
    const s = this.state;
    let y = this.contentTop;
    const row = (label: string, cost: number, onTap: () => void, affordable: boolean) => {
      const panel = makePanel(this, 16, y, VIEW.width - 32, 70);
      panel.add(
        this.add.text(16, 22, label, {
          fontFamily: FONT.family,
          fontSize: "19px",
          color: COLORS.parchmentCss,
        }),
      );
      panel.add(
        makeButton(this, {
          x: VIEW.width - 32 - 150,
          y: 11,
          width: 138,
          height: 48,
          label: `${cost} 🪙`,
          fontSize: 18,
          enabled: affordable,
          onTap,
        }),
      );
      this.content.add(panel);
      y += 80;
    };

    row("Buy 10 Food", costs.buyResource("food", 10), () =>
      this.doAction({ type: "buyResource", resource: "food", amount: 10 }, "market"),
      s.resources.coin >= costs.buyResource("food", 10),
    );
    row("Buy 10 Firewood", costs.buyResource("firewood", 10), () =>
      this.doAction({ type: "buyResource", resource: "firewood", amount: 10 }, "market"),
      s.resources.coin >= costs.buyResource("firewood", 10),
    );
    row("Buy 2 Buckets", costs.buyResource("buckets", 2), () =>
      this.doAction({ type: "buyResource", resource: "buckets", amount: 2 }, "market"),
      s.resources.coin >= costs.buyResource("buckets", 2),
    );
    row(`Hire Warder`, costs.hireGuard(), () =>
      this.doAction({ type: "hireGuard" }, "market"),
      s.resources.coin >= costs.hireGuard(),
    );
    row(
      `Expand Cells (+2 → ${s.cellCapacity + 2})`,
      costs.upgradeCapacity(s),
      () => this.doAction({ type: "upgradeCapacity" }, "market"),
      s.resources.coin >= costs.upgradeCapacity(s),
    );

    // Guard roster summary.
    const panel = makePanel(this, 16, y + 4, VIEW.width - 32, 120, `Warders (${s.guards.length})`);
    s.guards.slice(0, 4).forEach((g, i) => {
      panel.add(
        this.add.text(16, 34 + i * 20, `${g.name} — skill ${g.skill}, brutality ${g.brutality}, wage ${g.wage}`, {
          fontFamily: FONT.family,
          fontSize: "14px",
          color: COLORS.neutralCss,
        }),
      );
    });
    this.content.add(panel);
  }

  private buildLogPanel(y: number): void {
    const h = Math.max(80, this.contentBottom - y - 4);
    const panel = makePanel(this, 16, y, VIEW.width - 32, h, "Chronicle");
    const recent = this.state.log.slice(-Math.floor((h - 32) / 20));
    recent.forEach((entry, i) => {
      const color =
        entry.tone === "good" ? COLORS.goodCss : entry.tone === "bad" ? COLORS.badCss : COLORS.neutralCss;
      panel.add(
        this.add.text(12, 32 + i * 20, `d${entry.day}: ${entry.text}`, {
          fontFamily: FONT.family,
          fontSize: "13px",
          color,
          wordWrap: { width: VIEW.width - 56 },
        }),
      );
    });
    this.content.add(panel);
  }

  private renderEndDayBar(): void {
    this.content.add(
      makeButton(this, {
        x: 16,
        y: VIEW.height - 84,
        width: VIEW.width - 32,
        height: 68,
        label: "⏭  End Day",
        fontSize: 26,
        fill: COLORS.moss,
        textColor: COLORS.inkCss,
        onTap: () => this.endDay(),
      }),
    );
  }

  private endDay(): void {
    if (this.state.pendingDecision || this.state.gameOver) return;
    const beforeCoin = this.state.resources.coin;
    const beforeRep = this.state.reputation;
    const targetDay = this.state.day + 1;

    this.juice.dayWipe(`Day ${targetDay}`, () => {
      advanceDay(this.state);
      this.persist();
      this.animateReputationFrom = beforeRep;
      this.displayed.reputation = this.state.reputation;
      this.renderAll();
    });

    // Reveal the day's consequences once the wipe lifts.
    const delay = getSettings().reducedMotion ? 0 : 620;
    this.time.delayedCall(delay, () => this.dayFeedback(beforeCoin));
  }

  /** Screen-shake, flashes, floating coin, and a toast for the day's outcome. */
  private dayFeedback(beforeCoin: number): void {
    const deaths = this.state.lastEvents.reduce((n, e) => n + e.deaths, 0);
    if (deaths > 0) {
      this.juice.shake(420, 0.015);
      this.juice.flash(COLORS.blood);
    } else if (this.state.lastEvents.some((e) => e.kind === "fire")) {
      this.juice.shake(300, 0.01);
    }
    const coinDelta = Math.round(this.state.resources.coin - beforeCoin);
    if (coinDelta !== 0) {
      this.juice.floatNumber(
        this.coinChip.x,
        this.coinChip.y,
        `${coinDelta > 0 ? "+" : ""}${coinDelta}`,
        coinDelta > 0 ? COLORS.goldCss : COLORS.bloodCss,
      );
    }
    this.displayed.coin = this.state.resources.coin;

    // If a decision is pending, the modal speaks for the day; else toast it.
    if (!this.state.pendingDecision) {
      const head = this.state.lastEvents[0];
      if (head) this.toast(head.message, head.deaths > 0 ? COLORS.badCss : COLORS.goldCss);
    }
  }

  private doAction(action: Parameters<typeof applyAction>[1], _tab: Tab): void {
    const beforeCoin = this.state.resources.coin;
    const res = applyAction(this.state, action);
    if (!res.ok && res.error) {
      this.toast(res.error, COLORS.badCss);
    }
    this.persist();
    this.renderAll();
    const coinDelta = Math.round(this.state.resources.coin - beforeCoin);
    if (coinDelta !== 0) {
      this.juice.floatNumber(
        this.coinChip.x,
        this.coinChip.y,
        `${coinDelta > 0 ? "+" : ""}${coinDelta}`,
        coinDelta > 0 ? COLORS.goldCss : COLORS.bloodCss,
      );
    }
  }

  // ── Decision modal ─────────────────────────────────────────────────────────
  private renderModal(): void {
    this.modalLayer.removeAll(true);
    const d = this.state.pendingDecision;
    if (!d || this.state.gameOver) return;

    // A full-screen backdrop that swallows input to the game beneath.
    this.modalLayer.add(
      this.add
        .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.82)
        .setOrigin(0, 0)
        .setInteractive(),
    );

    const panelW = VIEW.width - 56;
    const optH = 92;
    const panelH = 150 + d.options.length * (optH + 14);
    const px = 28;
    const py = Math.max(60, (VIEW.height - panelH) / 2);
    const panel = makePanel(this, px, py, panelW, panelH, d.kind === "riot" ? "⚔  RIOT!" : "💰  A Quiet Word");

    panel.add(
      this.add.text(16, 44, d.prompt, {
        fontFamily: FONT.family,
        fontSize: "18px",
        color: COLORS.parchmentCss,
        align: "left",
        wordWrap: { width: panelW - 32 },
      }),
    );

    d.options.forEach((o, i) => {
      const oy = 118 + i * (optH + 14);
      panel.add(
        makeButton(this, {
          x: 16,
          y: oy,
          width: panelW - 32,
          height: 52,
          label: o.label,
          fontSize: 22,
          fill: COLORS.panelLight,
          onTap: () => this.resolveDecision(o.id),
        }),
      );
      panel.add(
        this.add.text(20, oy + 56, o.hint, {
          fontFamily: FONT.family,
          fontSize: "14px",
          color: COLORS.neutralCss,
          wordWrap: { width: panelW - 40 },
        }),
      );
    });

    this.modalLayer.add(panel);

    if (!getSettings().reducedMotion) {
      panel.setScale(0.92);
      panel.setAlpha(0);
      this.tweens.add({
        targets: panel,
        scale: 1,
        alpha: 1,
        duration: 220,
        ease: "Back.easeOut",
      });
    }
  }

  private resolveDecision(optionId: string): void {
    const beforeCoin = this.state.resources.coin;
    const beforeRep = this.state.reputation;
    const out = applyDecision(this.state, optionId);
    this.persist();
    this.animateReputationFrom = beforeRep;
    this.displayed.reputation = this.state.reputation;
    this.renderAll(); // pendingDecision now cleared → modal closes

    if (out.ok) {
      const deaths = out.deaths ?? 0;
      if (deaths > 0) {
        this.juice.shake(440, 0.016);
        this.juice.flash(COLORS.blood);
      }
      if (out.message) {
        const c =
          out.tone === "good"
            ? COLORS.goodCss
            : out.tone === "bad"
              ? COLORS.badCss
              : COLORS.goldCss;
        this.toast(out.message, c);
      }
      const coinDelta = Math.round(this.state.resources.coin - beforeCoin);
      if (coinDelta !== 0) {
        this.juice.floatNumber(
          this.coinChip.x,
          this.coinChip.y,
          `${coinDelta > 0 ? "+" : ""}${coinDelta}`,
          coinDelta > 0 ? COLORS.goldCss : COLORS.bloodCss,
        );
      }
    }
  }

  private renderGameOver(): void {
    const s = this.state;
    this.content.add(
      this.add.rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.85).setOrigin(0, 0),
    );
    this.content.add(
      this.add
        .text(VIEW.width / 2, VIEW.height / 2 - 120, "☠  THE KEEP HAS FALLEN", {
          fontFamily: FONT.family,
          fontSize: "32px",
          color: COLORS.badCss,
        })
        .setOrigin(0.5),
    );
    this.content.add(
      this.add
        .text(VIEW.width / 2, VIEW.height / 2 - 40, s.gameOverReason ?? "", {
          fontFamily: FONT.family,
          fontSize: "20px",
          color: COLORS.parchmentCss,
          align: "center",
          wordWrap: { width: VIEW.width - 80 },
        })
        .setOrigin(0.5),
    );
    this.content.add(
      this.add
        .text(VIEW.width / 2, VIEW.height / 2 + 30, `You lasted ${s.day} days.`, {
          fontFamily: FONT.family,
          fontSize: "20px",
          color: COLORS.neutralCss,
        })
        .setOrigin(0.5),
    );
    this.content.add(
      makeButton(this, {
        x: VIEW.width / 2 - 130,
        y: VIEW.height / 2 + 90,
        width: 260,
        height: 64,
        label: "Begin Anew",
        fontSize: 24,
        fill: COLORS.gold,
        textColor: COLORS.inkCss,
        onTap: () => {
          this.state = createInitialState(this.makeSeed());
          this.activeTab = "keep";
          this.persist();
          this.renderAll();
        },
      }),
    );
  }

  private toast(message: string, color: string = COLORS.parchmentCss): void {
    this.toastText?.destroy();
    this.toastText = this.add
      .text(VIEW.width / 2, this.contentTop - 6, message, {
        fontFamily: FONT.family,
        fontSize: "16px",
        color,
        backgroundColor: "#000000aa",
        padding: { x: 10, y: 6 },
        align: "center",
        wordWrap: { width: VIEW.width - 60 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1000);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 2200,
      duration: 600,
      onComplete: () => this.toastText?.destroy(),
    });
  }
}

function tierTitle(tier: GameState["tier"]): string {
  return {
    village: "Village Gaoler",
    town: "Town Warden",
    city: "City Castellan",
    crown: "Crown Keeper",
  }[tier];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
