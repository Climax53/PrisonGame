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
  advanceHour,
  applyAction,
  applyDecision,
  assessDangers,
  BALANCE,
  costs,
  createInitialState,
  dangerLevel,
  endingFor,
  guardQuarters,
  livingPrisoners,
  moralityStanding,
  projectDay,
  RARITY_ORDER,
  summarize,
  type GameState,
  type LaborAssignment,
  type Prisoner,
} from "../core";
import { runOnboarding } from "../ui/onboarding";
import { runSetup, type SetupResult } from "../ui/setup";
import { getProfile, hydrateProfile, recordProgress } from "../ui/profile";
import { COLORS, DANGER_COLOR, FONT, VIEW } from "../ui/theme";
import { makeBar, makeButton, makePanel } from "../ui/widgets";
import { loadGameAsync, saveGame } from "../ui/save";
import { Juice } from "../ui/fx";
import { getSettings, updateSettings } from "../ui/settings";
import { ACHIEVEMENTS, BANNER_COLORS, wardenDef } from "../core";

/** A resource/reputation snapshot used to animate deltas between renders. */
interface Vitals {
  coin: number;
  reputation: number;
}

type Tab = "keep" | "cells" | "offers" | "market";

/** Real milliseconds per in-game hour. One 15-hour day ≈ 2½ minutes of play —
 * the sun crosses on its own; the player only decides when to retire. */
const HOUR_REAL_MS = 10_000;

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
  /** Current page of the Keep roster (reset on new game). */
  private rosterPage = 0;
  /** Guard id awaiting a second "confirm dismiss" tap, if any. */
  private confirmDismissId: string | null = null;
  /** Re-entrancy guard: true while the day-wipe/tick is in flight. */
  private dayInFlight = false;
  /** The looping hour timer — queried for smooth between-tick countdowns. */
  private hourTimer!: Phaser.Time.TimerEvent;
  /** Live HUD elements updated between renders by the display ticker. */
  private clockLabel?: Phaser.GameObjects.Text;
  private sunFill?: Phaser.GameObjects.Rectangle;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bgCss);
    this.hud = this.add.container(0, 0);
    this.content = this.add.container(0, 0);
    this.modalLayer = this.add.container(0, 0).setDepth(800);
    this.juice = new Juice(this);
    // The living clock: an in-game hour passes on its own every HOUR_REAL_MS —
    // the player never has to advance it. Coin and labour drip in hourly; at
    // the evening bell progress stops until the player retires for the night.
    this.hourTimer = this.time.addEvent({
      delay: HOUR_REAL_MS,
      loop: true,
      callback: () => this.tickHour(),
    });
    // A lightweight, presentation-only ticker: glides the sun-strip and counts
    // down the minutes to nightfall in the gaps between hour ticks.
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => this.updateClock(),
    });
    void this.bootstrap();
  }

  /** One real-time hour tick. RNG-free in the core, so letting the timer run
   * can never desync a save. A no-op after the evening bell or mid-crisis. */
  private tickHour(): void {
    const s = this.state;
    if (!s || s.gameOver || s.pendingDecision || this.dayInFlight) return;
    if (s.hour >= BALANCE.time.dayEndHour) return;
    advanceHour(s);
    this.persist();
    this.displayed.coin = s.resources.coin;
    this.renderHud();
    if (s.hour >= BALANCE.time.dayEndHour) {
      // The bell has rung — swap the bottom bar to "Retire for the Night".
      this.renderContent();
      this.toast("🌙 The evening bell rings. The keep can do no more today.", COLORS.goldCss);
    }
  }

  /** Real milliseconds until the 9pm bell, blending the current partial hour
   * (from the live timer) with the whole hours still to come. */
  private msToEvening(): number {
    const remainingThisHour = this.hourTimer ? this.hourTimer.getRemaining() : HOUR_REAL_MS;
    const fullHoursLeft = Math.max(0, BALANCE.time.dayEndHour - this.state.hour - 1);
    return remainingThisHour + fullHoursLeft * HOUR_REAL_MS;
  }

  /** Fraction of the working day elapsed (0 at dawn → 1 at the bell), gliding
   * smoothly through each hour so the sun-strip never jumps. */
  private dayFraction(): number {
    const s = this.state;
    const T = BALANCE.time;
    if (s.hour >= T.dayEndHour) return 1;
    const paused = s.gameOver || !!s.pendingDecision || this.dayInFlight;
    const partial =
      paused || !this.hourTimer
        ? 0
        : Math.max(0, Math.min(1, 1 - this.hourTimer.getRemaining() / HOUR_REAL_MS));
    return Math.max(0, Math.min(1, (s.hour - T.dayStartHour + partial) / T.hoursPerDay));
  }

  /** Refresh only the live clock elements — cheap enough to run several times a
   * second without rebuilding the HUD. */
  private updateClock(): void {
    const s = this.state;
    if (!s) return;
    const label = this.clockLabel;
    if (label && label.active) {
      if (s.hour >= BALANCE.time.dayEndHour) {
        label.setText("🌙 nightfall");
        label.setColor(COLORS.steelCss);
      } else if (s.gameOver || s.pendingDecision || this.dayInFlight) {
        label.setText(`⏸ ${hourLabel(s.hour)}`);
        label.setColor(COLORS.neutralCss);
      } else {
        label.setText(`⏳ ${fmtCountdown(this.msToEvening())} to dusk`);
        label.setColor(COLORS.goldCss);
      }
    }
    if (this.sunFill && this.sunFill.active) {
      this.sunFill.width = VIEW.width * this.dayFraction();
    }
  }

  /**
   * Resume a save if one exists (checking durable native storage on device);
   * otherwise start fresh with a varied seed. The seed is taken at the boundary
   * (here, not in the core) so the core stays deterministic for tests.
   */
  private async bootstrap(): Promise<void> {
    await hydrateProfile();
    const saved = await loadGameAsync();
    this.state = saved ?? createInitialState(this.makeSeed());
    this.displayed = { coin: this.state.resources.coin, reputation: this.state.reputation };
    this.renderAll();
    // First-ever run: give the new warden the five-step tour (skippable).
    if (!saved && !getSettings().hasOnboarded) {
      runOnboarding(this, () => this.renderAll());
    }
  }

  /** Open the new-reign setup (warden select, identity, pacing, daily). */
  private openSetup(cancellable: boolean): void {
    runSetup(
      this,
      (result: SetupResult) => this.startNewReign(result),
      cancellable ? () => this.renderAll() : undefined,
    );
  }

  private startNewReign(result: SetupResult): void {
    this.state = createInitialState(result.seed, result.options);
    this.activeTab = "keep";
    this.rosterPage = 0;
    this.confirmDismissId = null;
    this.displayed = { coin: this.state.resources.coin, reputation: this.state.reputation };
    this.persist();
    this.renderAll();
  }

  /** Evaluate achievements and toast anything newly earned. */
  private toastAchievements(): void {
    const fresh = recordProgress(this.state);
    if (fresh.length === 0) return;
    this.juice.celebrate();
    const defs = fresh
      .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
      .filter(Boolean);
    const first = defs[0];
    if (first) {
      const extra = defs.length > 1 ? ` (+${defs.length - 1} more)` : "";
      this.toast(`🏆 Achievement: ${first.title}${extra}`, COLORS.goldCss);
    }
  }

  /** A non-deterministic seed for new games (RNG itself stays seeded/pure). */
  private makeSeed(): number {
    // Date.now is banned inside the core (determinism), but this scene IS the
    // boundary. performance.now alone restarts near 0 every launch and is
    // coarsened by browsers, so fresh installs would cluster onto the same
    // seeds — mix in wall-clock time for real spread.
    return (Date.now() ^ Math.floor(performance.now() * 1e6)) | 0;
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

    const bannerColor = BANNER_COLORS[s.heraldry?.color ?? 0] ?? COLORS.gold;
    const title = this.add.text(16, 12, `${s.heraldry?.sigil ?? "⚜"} ${s.keepName || "Warden's Keep"}`, {
      fontFamily: FONT.family,
      fontSize: "24px",
      color: `#${bannerColor.toString(16).padStart(6, "0")}`,
    });
    this.hud.add(
      this.add.text(18, 40, `${s.wardenName} — ${wardenDef(s.warden).name}${s.dailyChallenge ? "  •  📅 daily" : ""}`, {
        fontFamily: FONT.family,
        fontSize: "13px",
        color: COLORS.neutralCss,
      }),
    );
    const tierLabel = this.add
      .text(VIEW.width - 58, 16, `${tierTitle(s.tier)}  •  Day ${s.day}`, {
        fontFamily: FONT.family,
        fontSize: "20px",
        color: COLORS.parchmentCss,
      })
      .setOrigin(1, 0);
    this.hud.add([title, tierLabel]);

    // Active-condition badges: the clock first, then winter/victory countdowns.
    const evening = s.hour >= BALANCE.time.dayEndHour;
    const badges: string[] = [`${evening ? "🌙" : "☀"} ${hourLabel(s.hour)}`];
    if (s.winterDaysLeft > 0) badges.push(`❄ winter ${s.winterDaysLeft}d`);
    if (s.tier === "crown" && !s.gameOver) {
      badges.push(`👑 ${BALANCE.victory.crownDaysRequired - s.crownDays}d to glory`);
    }
    if (badges.length > 0) {
      this.hud.add(
        this.add
          .text(VIEW.width - 58, 40, badges.join("   "), {
            fontFamily: FONT.family,
            fontSize: "14px",
            color: COLORS.goldCss,
          })
          .setOrigin(1, 0),
      );
    }

    // Settings gear — opens the settings/achievements sheet.
    this.hud.add(
      makeButton(this, {
        x: VIEW.width - 48,
        y: 8,
        width: 40,
        height: 40,
        label: "⚙",
        fontSize: 22,
        fill: COLORS.panelLight,
        onTap: () => this.openSettings(),
      }),
    );

    // Resource row, each with tomorrow-you's expected daily movement beneath —
    // the honest ledger (events excluded; the danger bars cover those).
    const fc = projectDay(s);
    const chips: Array<[string, string, string, number | null]> = [
      ["🪙", `${Math.round(r.coin)}`, COLORS.goldCss, fc.coin],
      ["🍖", `${round1(r.food)}`, COLORS.parchmentCss, fc.food],
      ["🪵", `${round1(r.firewood)}`, COLORS.parchmentCss, fc.firewood],
      ["🪣", `${round1(r.buckets)}`, COLORS.parchmentCss, fc.buckets],
      ["👤", `${sum.living}/${s.cellCapacity}`, COLORS.parchmentCss, null],
    ];
    const chipW = VIEW.width / chips.length;
    chips.forEach(([icon, val, color, delta], i) => {
      const cx = i * chipW + chipW / 2;
      this.hud.add(
        this.add
          .text(cx, 58, `${icon}${val}`, {
            fontFamily: FONT.family,
            fontSize: "22px",
            color,
          })
          .setOrigin(0.5, 0),
      );
      if (delta !== null) {
        const d = Math.round(delta * 10) / 10;
        this.hud.add(
          this.add
            .text(cx, 84, `${d > 0 ? "+" : ""}${d}/d`, {
              fontFamily: FONT.family,
              fontSize: "13px",
              color: d > 0 ? COLORS.goodCss : d < 0 ? COLORS.badCss : COLORS.neutralCss,
            })
            .setOrigin(0.5, 0),
        );
      }
    });

    // Reputation bar — animates from the previously displayed value. Shortened
    // to leave room for the live countdown-to-dusk clock on its right.
    this.hud.add(
      this.add.text(16, 104, "Reputation", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.neutralCss,
      }),
    );
    const repBar = makeBar(this, 16, 124, VIEW.width - 32 - 150, 16, s.reputation / 100, COLORS.gold);
    this.hud.add(repBar);
    if (this.animateReputationFrom !== null) {
      const fill = repBar.getData("fill") as Phaser.GameObjects.Rectangle;
      const full = repBar.getData("fullWidth") as number;
      this.juice.tweenBar(fill, this.animateReputationFrom / 100, s.reputation / 100, full);
      this.animateReputationFrom = null;
    }
    // Live countdown to nightfall — the visible proof the day runs on its own.
    this.clockLabel = this.add
      .text(VIEW.width - 16, 132, "", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.goldCss,
      })
      .setOrigin(1, 0.5);
    this.hud.add(this.clockLabel);

    // Corps-at-a-glance: how many warders, and whether the bunks hold them.
    const bunks = guardQuarters(s);
    const crowded = s.guards.length > bunks;
    this.hud.add(
      this.add
        .text(VIEW.width - 16, 100, `⚔${s.guards.length}  🛏${s.guards.length}/${bunks}`, {
          fontFamily: FONT.family,
          fontSize: "18px",
          color: crowded ? COLORS.badCss : COLORS.goodCss,
        })
        .setOrigin(1, 0),
    );

    // A thin sun-strip along the banner's foot: how much daylight remains.
    const dayFrac = Math.max(
      0,
      Math.min(1, (s.hour - BALANCE.time.dayStartHour) / BALANCE.time.hoursPerDay),
    );
    this.hud.add(this.add.rectangle(0, 145, VIEW.width, 5, COLORS.shadow).setOrigin(0, 0));
    this.sunFill = this.add
      .rectangle(0, 145, VIEW.width * dayFrac, 5, evening ? COLORS.steel : COLORS.gold)
      .setOrigin(0, 0);
    this.hud.add(this.sunFill);

    // Tab bar.
    const tabs: Array<[Tab, string]> = [
      ["keep", "🏰 Keep"],
      ["cells", "🔒 Cells"],
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
          fontSize: 18,
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

    // Populate the live clock immediately (both fields now exist).
    this.updateClock();
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
      case "cells":
        this.buildCellsTab();
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
    const stripBottom = this.buildStatusStrip(this.contentTop);
    const living = s.prisoners.filter((p) => p.alive);
    if (living.length === 0) {
      this.content.add(
        this.add
          .text(VIEW.width / 2, stripBottom + 30, "The cells stand empty.\nAccept a prisoner from the Offers tab.", {
            fontFamily: FONT.family,
            fontSize: "22px",
            color: COLORS.neutralCss,
            align: "center",
          })
          .setOrigin(0.5, 0),
      );
      this.buildLogPanel(stripBottom + 120);
      return;
    }

    this.content.add(
      this.add.text(16, stripBottom, "Tap a prisoner to cycle their labour assignment:", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.neutralCss,
      }),
    );

    const cardH = 86;
    const startY = stripBottom + 28;
    // Reserve at least 120px for the log; page the roster so every inmate is
    // always reachable no matter how large the keep grows.
    const maxRows = Math.max(1, Math.floor((this.contentBottom - startY - 120 - 44) / (cardH + 8)));
    const pages = Math.max(1, Math.ceil(living.length / maxRows));
    this.rosterPage = Math.min(this.rosterPage, pages - 1);
    const pageStart = this.rosterPage * maxRows;
    const shown = living.slice(pageStart, pageStart + maxRows);
    shown.forEach((p, i) => {
      this.content.add(this.buildPrisonerCard(p, 16, startY + i * (cardH + 8), VIEW.width - 32, cardH));
    });

    let cursorY = startY + shown.length * (cardH + 8);
    if (pages > 1) {
      // Pager: ‹ Prev | Page X/Y | Next ›
      this.content.add(
        makeButton(this, {
          x: 16, y: cursorY, width: 120, height: 40, label: "‹ Prev", fontSize: 17,
          enabled: this.rosterPage > 0,
          onTap: () => { this.rosterPage--; this.renderContent(); },
        }),
      );
      this.content.add(
        this.add
          .text(VIEW.width / 2, cursorY + 20, `${pageStart + 1}–${pageStart + shown.length} of ${living.length}`, {
            fontFamily: FONT.family, fontSize: "16px", color: COLORS.neutralCss,
          })
          .setOrigin(0.5, 0.5),
      );
      this.content.add(
        makeButton(this, {
          x: VIEW.width - 16 - 120, y: cursorY, width: 120, height: 40, label: "Next ›", fontSize: 17,
          enabled: this.rosterPage < pages - 1,
          onTap: () => { this.rosterPage++; this.renderContent(); },
        }),
      );
      cursorY += 46;
    }

    this.buildLogPanel(cursorY + 4);
  }

  /** Warden morality (diverging bar) + honest next-day danger forecast. */
  private buildStatusStrip(y: number): number {
    const s = this.state;
    const w = VIEW.width - 32;
    const h = 132;
    const panel = makePanel(this, 16, y, w, h);

    // ── Morality ──
    panel.add(
      this.add.text(12, 8, `⚖  Standing: ${moralityStanding(s.morality)}`, {
        fontFamily: FONT.family,
        fontSize: "18px",
        color:
          s.morality > 10 ? COLORS.goodCss : s.morality < -10 ? COLORS.badCss : COLORS.neutralCss,
      }),
    );
    panel.add(
      this.add
        .text(w - 12, 10, `${Math.round(s.morality)}`, {
          fontFamily: FONT.family,
          fontSize: "16px",
          color: COLORS.neutralCss,
        })
        .setOrigin(1, 0),
    );
    const barX = 12;
    const barY = 34;
    const barW = w - 24;
    const barH = 14;
    const cx = barX + barW / 2;
    panel.add(this.add.rectangle(barX, barY, barW, barH, COLORS.shadow).setOrigin(0, 0));
    const half = barW / 2 - 2;
    const mag = Math.min(1, Math.abs(s.morality) / 100) * half;
    if (mag > 0) {
      if (s.morality > 0) {
        panel.add(this.add.rectangle(cx, barY + 1, mag, barH - 2, COLORS.moss).setOrigin(0, 0));
      } else {
        panel.add(this.add.rectangle(cx - mag, barY + 1, mag, barH - 2, COLORS.blood).setOrigin(0, 0));
      }
    }
    panel.add(this.add.rectangle(cx, barY - 2, 2, barH + 4, COLORS.parchment).setOrigin(0.5, 0));
    panel.add(
      this.add.text(barX, barY + barH + 2, "Tyrant", { fontFamily: FONT.family, fontSize: "11px", color: COLORS.badCss }),
    );
    panel.add(
      this.add
        .text(barX + barW, barY + barH + 2, "Saint", { fontFamily: FONT.family, fontSize: "11px", color: COLORS.goodCss })
        .setOrigin(1, 0),
    );

    // ── Danger forecast ──
    panel.add(
      this.add.text(12, 66, "Tomorrow's dangers (a warning, not a promise)", {
        fontFamily: FONT.family,
        fontSize: "12px",
        color: COLORS.neutralCss,
      }),
    );
    const dangers = assessDangers(s);
    const items: Array<[string, number]> = [
      ["Riot", dangers.riot],
      ["Fire", dangers.fire],
      ["Sick", dangers.disease],
      ["Escape", dangers.escape],
    ];
    const colW = (w - 24) / items.length;
    items.forEach(([label, p], i) => {
      const cxi = 12 + i * colW;
      const trackW = colW - 14;
      panel.add(
        this.add.text(cxi, 86, label, { fontFamily: FONT.family, fontSize: "13px", color: COLORS.parchmentCss }),
      );
      panel.add(this.add.rectangle(cxi, 104, trackW, 12, COLORS.shadow).setOrigin(0, 0));
      panel.add(
        this.add
          .rectangle(cxi, 104, Math.max(0, Math.min(1, p)) * trackW, 12, DANGER_COLOR[dangerLevel(p)])
          .setOrigin(0, 0),
      );
      panel.add(
        this.add
          .text(cxi + trackW, 118, `${Math.round(p * 100)}%`, {
            fontFamily: FONT.family,
            fontSize: "11px",
            color: COLORS.neutralCss,
          })
          .setOrigin(1, 0),
      );
    });

    this.content.add(panel);
    return y + h + 10;
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
        // Name tinted by rarity — the notoriety of the inmate at a glance.
        color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
      }),
    );
    panel.add(
      this.add.text(34, 34, `◆ ${p.rarity}  •  ${p.severity}  •  ${p.sentenceDays}d left  •  ${cellName(p)}`, {
        fontFamily: FONT.family,
        fontSize: "14px",
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
    // Re-task changes the day's projected yield, so refresh the HUD forecast
    // chips too — not just the prisoner card badge.
    this.renderHud();
    this.renderContent();
  }

  /** The cell block: every cell drawn in place, its occupant named, tap to
   * re-task them. Overflow inmates (beyond capacity) wait in the yard. */
  private buildCellsTab(): void {
    const s = this.state;
    const living = s.prisoners.filter((p) => p.alive);
    const byCell = new Map<number, Prisoner>();
    for (const p of living) {
      if (typeof p.cell === "number") byCell.set(p.cell, p);
    }

    this.content.add(
      this.add.text(16, this.contentTop, "The cell block — tap an inmate to change their labour.", {
        fontFamily: FONT.family,
        fontSize: "16px",
        color: COLORS.neutralCss,
      }),
    );

    const cap = s.cellCapacity;
    const cols = cap <= 9 ? 3 : 4;
    const gap = 10;
    const cellW = (VIEW.width - 32 - gap * (cols - 1)) / cols;
    const rows = Math.ceil(cap / cols);
    const gridTop = this.contentTop + 30;
    const yard = living.filter((p) => typeof p.cell !== "number" || p.cell >= cap);
    const yardH = yard.length > 0 ? 64 : 0;
    const availH = this.contentBottom - gridTop - yardH - 8;
    const cellH = Math.max(88, Math.min(150, Math.floor(availH / rows) - gap));

    for (let i = 0; i < cap; i++) {
      const x = 16 + (i % cols) * (cellW + gap);
      const y = gridTop + Math.floor(i / cols) * (cellH + gap);
      const p = byCell.get(i);
      const panel = makePanel(this, x, y, cellW, cellH);
      panel.add(
        this.add.text(8, 6, `Cell ${i + 1}`, {
          fontFamily: FONT.family,
          fontSize: "12px",
          color: COLORS.neutralCss,
        }),
      );
      if (p) {
        const sev = COLORS.severity[p.severity] ?? COLORS.steel;
        panel.add(this.add.rectangle(8, 26, 8, cellH - 36, sev).setOrigin(0, 0));
        panel.add(
          this.add.text(22, 26, clip(p.name, Math.floor((cellW - 30) / 8.5)), {
            fontFamily: FONT.family,
            fontSize: "15px",
            color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
          }),
        );
        panel.add(
          this.add.text(22, 48, `${p.severity} • ${p.sentenceDays}d`, {
            fontFamily: FONT.family,
            fontSize: "12px",
            color: COLORS.neutralCss,
          }),
        );
        panel.add(
          this.add.text(22, cellH - 26, `${LABOR_ICON[p.assignment]} ${p.assignment}`, {
            fontFamily: FONT.family,
            fontSize: "14px",
            color: COLORS.goldCss,
          }),
        );
        const hit = this.add
          .rectangle(0, 0, cellW, cellH, 0xffffff, 0.001)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerup", () => this.cycleLabor(p));
        panel.add(hit);
      } else {
        panel.add(
          this.add
            .text(cellW / 2, cellH / 2 + 6, "— empty —", {
              fontFamily: FONT.family,
              fontSize: "13px",
              color: COLORS.neutralCss,
            })
            .setOrigin(0.5, 0.5)
            .setAlpha(0.5),
        );
      }
      this.content.add(panel);
    }

    if (yard.length > 0) {
      const yardY = gridTop + rows * (cellH + gap);
      const panel = makePanel(this, 16, yardY, VIEW.width - 32, 56, "⚠ The Yard (over capacity)");
      panel.add(
        this.add.text(12, 32, clip(yard.map((p) => p.name).join(", "), 74), {
          fontFamily: FONT.family,
          fontSize: "13px",
          color: COLORS.badCss,
        }),
      );
      this.content.add(panel);
    }
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
          color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
        }),
      );
      panel.add(
        this.add.text(36, 70, `◆ ${p.rarity}  •  ${p.severity}  •  sentence ${p.sentenceDays}d`, {
          fontFamily: FONT.family,
          fontSize: "15px",
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
    const w = VIEW.width - 32;
    let y = this.contentTop;

    // Provisions — three quick-buys side by side.
    {
      const panel = makePanel(this, 16, y, w, 96, "Provisions");
      const buys: Array<["food" | "firewood" | "buckets", string, number]> = [
        ["food", "🍖 +10", 10],
        ["firewood", "🪵 +10", 10],
        ["buckets", "🪣 +2", 2],
      ];
      const bw = (w - 16 * 2 - 12 * 2) / 3;
      buys.forEach(([resource, label, amount], i) => {
        const cost = costs.buyResource(resource, amount, s);
        panel.add(
          makeButton(this, {
            x: 16 + i * (bw + 12), y: 36, width: bw, height: 48,
            label: `${label}  ${cost}🪙`, fontSize: 16,
            enabled: s.resources.coin >= cost,
            onTap: () => this.doAction({ type: "buyResource", resource, amount }, "market"),
          }),
        );
      });
      this.content.add(panel);
      y += 106;
    }

    // Muster — hire and expand, side by side.
    {
      const panel = makePanel(this, 16, y, w, 70);
      const bw = (w - 16 * 2 - 12) / 2;
      const hireCost = costs.hireGuard(s);
      const capCost = costs.upgradeCapacity(s);
      panel.add(
        makeButton(this, {
          x: 16, y: 11, width: bw, height: 48,
          label: `Hire Warder  ${hireCost}🪙`, fontSize: 16,
          enabled: s.resources.coin >= hireCost,
          onTap: () => this.doAction({ type: "hireGuard" }, "market"),
        }),
      );
      panel.add(
        makeButton(this, {
          x: 16 + bw + 12, y: 11, width: bw, height: 48,
          label: `Cells +2 (→${s.cellCapacity + 2})  ${capCost}🪙`, fontSize: 16,
          enabled: s.resources.coin >= capCost,
          onTap: () => this.doAction({ type: "upgradeCapacity" }, "market"),
        }),
      );
      this.content.add(panel);
      y += 80;
    }

    // Keep buildings — one-time constructions, each a permanent dial.
    const BUILDING_ROWS: Array<[Parameters<typeof costs.build>[0], string, string]> = [
      ["infirmary", "🏥 Infirmary", "heals every inmate daily"],
      ["chapel", "⛪ Chapel", "calms the cells daily"],
      ["gallows", "🪢 Gallows", "fear: quiet cells, fewer escapes — hardens your soul"],
      ["walls", "🧱 High Walls", "halves escape attempts"],
      ["barracks", "🛏 Barracks", `bunks for ${BALANCE.buildings.barracks.quarters} more warders — crowding sours the corps`],
      ["tavern", "🍺 Tavern", "ale and dice each evening lift the warders' spirits"],
    ];
    for (const [id, label, hint] of BUILDING_ROWS) {
      const built = s.buildings[id];
      const cost = costs.build(id, s);
      const panel2 = makePanel(this, 16, y, w, 66);
      panel2.add(
        this.add.text(16, 10, label + (built ? "  ✓ built" : ""), {
          fontFamily: FONT.family, fontSize: "17px",
          color: built ? COLORS.goodCss : COLORS.parchmentCss,
        }),
      );
      panel2.add(
        this.add.text(16, 36, hint, {
          fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss,
        }),
      );
      if (!built) {
        panel2.add(
          makeButton(this, {
            x: w - 150, y: 9, width: 138, height: 48,
            label: `${cost} 🪙`, fontSize: 18,
            enabled: s.resources.coin >= cost,
            onTap: () => this.doAction({ type: "build", building: id }, "market"),
          }),
        );
      }
      this.content.add(panel2);
      y += 74;
    }

    // Guard roster with morale and dismissal (two-tap confirm — destructive).
    const shown = s.guards.slice(0, 5);
    const rosterH = 40 + shown.length * 32 + (s.guards.length > 5 ? 22 : 0);
    const bunks = guardQuarters(s);
    const panel = makePanel(
      this, 16, y + 4, w, Math.max(70, rosterH),
      `Warders (${s.guards.length})  •  🛏 ${s.guards.length}/${bunks} bunks`,
    );
    shown.forEach((g, i) => {
      const rowY = 36 + i * 32;
      panel.add(
        this.add.text(16, rowY + 6, `${moraleFace(g.morale)} ${clip(g.name, 20)} — skill ${g.skill}, wage ${g.wage}, morale ${Math.round(g.morale)}`, {
          fontFamily: FONT.family,
          fontSize: "14px",
          color: COLORS.rarity[g.rarity] ?? COLORS.neutralCss,
        }),
      );
      const confirming = this.confirmDismissId === g.id;
      panel.add(
        makeButton(this, {
          x: w - 118, y: rowY, width: 106, height: 28,
          label: confirming ? "Dismiss?" : "✕",
          fontSize: 14,
          fill: confirming ? COLORS.blood : COLORS.panelLight,
          onTap: () => {
            if (confirming) {
              this.confirmDismissId = null;
              this.doAction({ type: "fireGuard", guardId: g.id }, "market");
            } else {
              this.confirmDismissId = g.id;
              this.renderContent();
            }
          },
        }),
      );
    });
    if (s.guards.length > 5) {
      panel.add(
        this.add.text(16, 36 + shown.length * 32, `…and ${s.guards.length - 5} more on the payroll`, {
          fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss,
        }),
      );
    }
    this.content.add(panel);
  }

  private buildLogPanel(y: number): void {
    const h = Math.max(80, this.contentBottom - y - 4);
    const panel = makePanel(this, 16, y, VIEW.width - 32, h, "Chronicle");
    const recent = this.state.log.slice(-Math.floor((h - 32) / 20));
    recent.forEach((entry, i) => {
      const color =
        entry.tone === "good" ? COLORS.goodCss : entry.tone === "bad" ? COLORS.badCss : COLORS.neutralCss;
      // One entry, one line: clip instead of wrapping, so rows can never
      // overlap the fixed 20px line pitch below the prisoner cards.
      panel.add(
        this.add.text(12, 32 + i * 20, clip(`d${entry.day}: ${entry.text}`, 78), {
          fontFamily: FONT.family,
          fontSize: "13px",
          color,
        }),
      );
    });
    this.content.add(panel);
  }

  private renderEndDayBar(): void {
    const evening = this.state.hour >= BALANCE.time.dayEndHour;
    this.content.add(
      makeButton(this, {
        x: 16,
        y: VIEW.height - 84,
        width: VIEW.width - 32,
        height: 68,
        label: evening ? "🌙  Retire for the Night" : "⏩  Skip to Evening",
        fontSize: 26,
        fill: evening ? COLORS.moss : COLORS.panelLight,
        textColor: evening ? COLORS.inkCss : COLORS.parchmentCss,
        onTap: () => (evening ? this.endDay() : this.skipToEvening()),
      }),
    );
  }

  /** Fast-forward the remaining daylight (income and labour accrue in full) —
   * the impatient warden's lever. RNG-free: no different from waiting. */
  private skipToEvening(): void {
    const s = this.state;
    if (s.gameOver || s.pendingDecision || this.dayInFlight) return;
    const beforeCoin = s.resources.coin;
    while (s.hour < BALANCE.time.dayEndHour) advanceHour(s);
    this.persist();
    this.renderAll();
    const delta = Math.round(s.resources.coin - beforeCoin);
    if (delta !== 0) {
      this.juice.floatNumber(this.coinChip.x, this.coinChip.y, `+${delta}`, COLORS.goldCss);
    }
    this.displayed.coin = s.resources.coin;
  }

  private endDay(): void {
    if (this.state.pendingDecision || this.state.gameOver || this.dayInFlight) return;
    this.dayInFlight = true;
    const beforeCoin = this.state.resources.coin;
    const beforeRep = this.state.reputation;
    const targetDay = this.state.day + 1;

    this.juice.dayWipe(`Day ${targetDay}`, () => {
      advanceDay(this.state);
      this.persist();
      this.animateReputationFrom = beforeRep;
      this.displayed.reputation = this.state.reputation;
      this.renderAll();
      // The tick has landed — safe to accept the next End Day. The feedback
      // below is fire-and-forget visuals only.
      this.dayInFlight = false;
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

    // Achievements land after the day's news has had its moment.
    this.time.delayedCall(2600, () => this.toastAchievements());
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

  // ── Settings & achievements sheet ──────────────────────────────────────────
  private openSettings(): void {
    const layer = this.add.container(0, 0).setDepth(870);
    const close = () => {
      layer.destroy();
      this.renderAll();
    };
    const render = () => {
      layer.removeAll(true);
      layer.add(
        this.add
          .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.9)
          .setOrigin(0, 0)
          .setInteractive(),
      );
      const w = VIEW.width - 64;
      const panel = makePanel(this, 32, 60, w, VIEW.height - 160, "⚙ The Warden's Desk");

      // Reduced motion toggle.
      const rm = getSettings().reducedMotion;
      panel.add(
        this.add.text(16, 44, "Reduced motion", {
          fontFamily: FONT.family, fontSize: "18px", color: COLORS.parchmentCss,
        }),
      );
      panel.add(
        makeButton(this, {
          x: w - 116, y: 36, width: 100, height: 40,
          label: rm ? "ON" : "OFF", fontSize: 16,
          fill: rm ? COLORS.gold : COLORS.panelLight,
          textColor: rm ? COLORS.inkCss : COLORS.parchmentCss,
          onTap: () => {
            updateSettings({ reducedMotion: !rm });
            render();
          },
        }),
      );

      // Achievements ledger.
      const profile = getProfile();
      panel.add(
        this.add.text(16, 96, `🏆 Deeds  (${profile.achievements.length}/${ACHIEVEMENTS.length})`, {
          fontFamily: FONT.family, fontSize: "18px", color: COLORS.goldCss,
        }),
      );
      ACHIEVEMENTS.forEach((a, i) => {
        const earned = profile.achievements.includes(a.id);
        const y = 128 + i * 44;
        panel.add(
          this.add.text(16, y, `${earned ? "✓" : "·"} ${a.title}`, {
            fontFamily: FONT.family, fontSize: "15px",
            color: earned ? COLORS.goodCss : COLORS.neutralCss,
          }),
        );
        panel.add(
          this.add.text(32, y + 18, earned && a.unlocksWarden ? `${a.text}  → unlocked ${a.unlocksWarden}` : a.text, {
            fontFamily: FONT.family, fontSize: "12px", color: COLORS.neutralCss,
          }),
        );
      });

      const bottomY = 128 + ACHIEVEMENTS.length * 44 + 12;
      panel.add(
        this.add.text(16, bottomY, `Reigns: ${profile.runsCompleted}  •  Victories: ${profile.runsWon}  •  Longest: ${profile.bestReign}d`, {
          fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss,
        }),
      );

      panel.add(
        makeButton(this, {
          x: 16, y: bottomY + 32, width: (w - 44) / 2, height: 52,
          label: "⚜ A New Reign", fontSize: 17,
          fill: COLORS.blood,
          onTap: () => {
            layer.destroy();
            this.openSetup(true);
          },
        }),
      );
      panel.add(
        makeButton(this, {
          x: 16 + (w - 44) / 2 + 12, y: bottomY + 32, width: (w - 44) / 2, height: 52,
          label: "Close", fontSize: 17,
          onTap: close,
        }),
      );
      layer.add(panel);
    };
    render();
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
      // A decision can end the run (or earn a deed) on the spot.
      this.time.delayedCall(2600, () => this.toastAchievements());
    }
  }

  /** The reign summary — themed ending + shareable statistics card. */
  private renderGameOver(): void {
    const s = this.state;
    const ending = endingFor(s);
    const accent = ending.won ? COLORS.goldCss : COLORS.badCss;

    this.content.add(
      this.add.rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.92).setOrigin(0, 0),
    );

    let y = 120;
    this.content.add(
      this.add
        .text(VIEW.width / 2, y, ending.title, {
          fontFamily: FONT.family,
          fontSize: "34px",
          color: accent,
        })
        .setOrigin(0.5, 0),
    );
    y += 60;
    this.content.add(
      this.add
        .text(VIEW.width / 2, y, ending.text, {
          fontFamily: FONT.family,
          fontSize: "18px",
          color: COLORS.parchmentCss,
          align: "center",
          wordWrap: { width: VIEW.width - 96 },
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0),
    );
    y += 170;

    // The reign in numbers.
    const st = s.stats;
    const panel = makePanel(this, 48, y, VIEW.width - 96, 330, "⚜ The Reign in Numbers");
    const rows: Array<[string, string]> = [
      ["Days ruled", `${s.day}`],
      ["Coin taken in", `${Math.round(st.totalCoinEarned)} 🪙`],
      ["Prisoners freed", `${st.totalReleased}`],
      ["Deaths in the keep", `${st.totalDeaths}`],
      ["Escapes", `${st.totalEscapes}`],
      ["Riots faced", `${st.riotsFaced}`],
      ["Hard choices made", `${st.decisionsMade}`],
      ["Rarest inmate held", `${RARITY_ORDER[st.bestRarityRank] ?? "common"}`],
      ["Peak reputation", `${Math.round(st.peakReputation)}`],
      ["Final standing", moralityStanding(s.morality)],
    ];
    rows.forEach(([label, value], i) => {
      const ry = 40 + i * 28;
      panel.add(
        this.add.text(16, ry, label, {
          fontFamily: FONT.family, fontSize: "16px", color: COLORS.neutralCss,
        }),
      );
      panel.add(
        this.add
          .text(VIEW.width - 96 - 16, ry, value, {
            fontFamily: FONT.family, fontSize: "16px", color: COLORS.parchmentCss,
          })
          .setOrigin(1, 0),
      );
    });
    this.content.add(panel);
    y += 350;

    this.content.add(
      makeButton(this, {
        x: VIEW.width / 2 - 250, y, width: 240, height: 60,
        label: "📜 Save Summary",
        fontSize: 20,
        fill: COLORS.panelLight,
        onTap: () => this.saveSummaryImage(),
      }),
    );
    this.content.add(
      makeButton(this, {
        x: VIEW.width / 2 + 10, y, width: 240, height: 60,
        label: "Begin Anew",
        fontSize: 22,
        fill: COLORS.gold,
        textColor: COLORS.inkCss,
        onTap: () => this.openSetup(true),
      }),
    );
  }

  /** Snapshot the reign summary to a PNG the player can save/share. */
  private saveSummaryImage(): void {
    try {
      this.game.renderer.snapshot((snap) => {
        try {
          const img = snap as HTMLImageElement;
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const a = document.createElement("a");
          a.href = canvas.toDataURL("image/png");
          a.download = `wardens-keep-day-${this.state.day}.png`;
          a.click();
          this.toast("Reign summary saved.", COLORS.goldCss);
        } catch {
          this.toast("Could not save the image on this device.", COLORS.badCss);
        }
      });
    } catch {
      this.toast("Could not save the image on this device.", COLORS.badCss);
    }
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

/** 6 → "6am", 12 → "noon", 21 → "9pm". */
function hourLabel(h: number): string {
  if (h === 12) return "noon";
  if (h === 0 || h === 24) return "midnight";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Milliseconds → "m:ss" for the countdown-to-dusk clock. */
function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Clip a string to `max` chars with an ellipsis (single-line layouts). */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

/** A warder's mood at a glance. */
function moraleFace(morale: number): string {
  return morale >= 70 ? "😊" : morale >= 40 ? "😐" : "😠";
}

/** Which cell an inmate sleeps in, 1-based for display. */
function cellName(p: Prisoner): string {
  return typeof p.cell === "number" ? `cell ${p.cell + 1}` : "the yard";
}
