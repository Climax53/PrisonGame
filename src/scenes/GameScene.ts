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
import { getProfile, grantDailyCrowns, hydrateProfile, recordProgress } from "../ui/profile";
import { COLORS, DANGER_COLOR, FONT, VIEW } from "../ui/theme";
import { makeBar, makeButton, makePanel } from "../ui/widgets";
import { loadGameAsync, saveGame } from "../ui/save";
import { Juice } from "../ui/fx";
import { getSettings, updateSettings } from "../ui/settings";
import { ACHIEVEMENTS, BANNER_COLORS, SIGILS, traitDef, wardenDef } from "../core";
import {
  buildDecreeStrip,
  ftueActive,
  markDecree,
  showAppointmentLetter,
  type DecreeStep,
} from "../ui/ftue";
import { openStoreSheet } from "../ui/storeSheet";
import { THEMES } from "../ui/store";
import {
  artCover,
  artImage,
  decisionBannerKey,
  DECISION_TITLE,
  ensureAnims,
  hasArt,
  keepExteriorKey,
  LABOR_ICON_KEY,
  prisonerPortraitKey,
  queueArt,
  rarityFrameKey,
  rarityPipKey,
} from "../ui/art";

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

  /** Load the full art set with a themed progress bar. Failures degrade to
   * the emoji placeholders — the game never blocks on a missing file. */
  preload(): void {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const label = this.add
      .text(cx, cy - 40, "Raising the keep…", {
        fontFamily: FONT.family,
        fontSize: "22px",
        color: COLORS.goldCss,
      })
      .setOrigin(0.5);
    const track = this.add.rectangle(cx, cy, 420, 16, COLORS.shadow).setOrigin(0.5);
    const fill = this.add
      .rectangle(cx - 208, cy, 1, 12, COLORS.gold)
      .setOrigin(0, 0.5);
    this.load.on("progress", (p: number) => {
      fill.width = Math.max(1, 416 * p);
    });
    this.load.once("complete", () => {
      label.destroy();
      track.destroy();
      fill.destroy();
    });
    queueArt(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bgCss);
    this.hud = this.add.container(0, 0);
    this.content = this.add.container(0, 0);
    this.modalLayer = this.add.container(0, 0).setDepth(800);
    this.juice = new Juice(this);
    ensureAnims(this);
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
    // Ambient life: the cells murmur every so often.
    this.time.addEvent({
      delay: 13000,
      loop: true,
      callback: () => this.ambientMutter(),
    });
    void this.bootstrap();
  }

  /** One real-time hour tick. RNG-free in the core, so letting the timer run
   * can never desync a save. A no-op after the evening bell or mid-crisis. */
  private tickHour(): void {
    const s = this.state;
    if (!s || s.gameOver || s.pendingDecision || this.dayInFlight) return;
    if (s.hour >= BALANCE.time.dayEndHour) return;
    const coinBefore = s.resources.coin;
    advanceHour(s);
    this.persist();
    this.displayed.coin = s.resources.coin;
    this.renderHud();
    // The hour's earnings visibly drip in — the screen is never a still image.
    const slice = s.resources.coin - coinBefore;
    if (slice > 0.05 && !getSettings().reducedMotion) {
      this.juice.floatNumber(this.coinChip.x + 24, this.coinChip.y + 18, `+${round1(slice)}`, COLORS.goldCss);
    }
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
    // The first "win": the magistrate's letter names the player and pays a
    // signing bonus (see docs/research/UI_DENSITY_DIRECTIVES.md §2).
    showAppointmentLetter(this, this.state, () => {
      this.persist();
      this.renderAll();
      this.juice.floatNumber(this.coinChip.x, this.coinChip.y, "+40", COLORS.goldCss);
    });
  }

  /** The active keep theme (cosmetic DLC): postcard phase lock + accent. */
  private activeTheme() {
    return THEMES.find((t) => t.id === getProfile().activeTheme) ?? THEMES[0];
  }

  /** Open the Royal Mint (store) sheet. */
  openStore(): void {
    openStoreSheet(this, {
      state: this.state,
      onChanged: () => {
        this.persist();
        this.renderAll();
      },
      toast: (m, c) => this.toast(m, c),
    });
  }

  /** FTUE hook: mark a decree done and pay its reward with fanfare. */
  private decree(step: DecreeStep): void {
    const reward = markDecree(step);
    if (reward <= 0) return;
    this.state.resources.coin += reward;
    this.persist();
    this.juice.celebrate();
    this.juice.floatNumber(this.coinChip.x, this.coinChip.y, `+${reward}`, COLORS.goldCss);
    this.toast(`Decree fulfilled! +${reward} coin`, COLORS.goldCss);
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
    // Heraldry sigil: painted icon when the art is loaded, emoji otherwise.
    const sigilIdx = SIGILS.indexOf((s.heraldry?.sigil ?? "🗝") as (typeof SIGILS)[number]);
    const sigilImg =
      sigilIdx >= 0 ? artImage(this, `sigil_${sigilIdx}`, 30, 26, 30, 30) : null;
    if (sigilImg) this.hud.add(sigilImg);
    const title = this.add.text(
      sigilImg ? 50 : 16,
      8,
      `${sigilImg ? "" : `${s.heraldry?.sigil ?? "⚜"} `}${s.keepName || "Warden's Keep"}`,
      {
        fontFamily: FONT.display,
        fontSize: "30px",
        color: `#${bannerColor.toString(16).padStart(6, "0")}`,
      },
    );
    this.hud.add(
      this.add.text(18, 40, `${s.wardenName} — ${wardenDef(s.warden).name}${s.dailyChallenge ? "  •  📅 daily" : ""}`, {
        fontFamily: FONT.family,
        fontSize: "13px",
        color: COLORS.neutralCss,
      }),
    );
    const tierLabel = this.add
      .text(VIEW.width - 160, 10, `${tierTitle(s.tier)} · Day ${s.day}`, {
        fontFamily: FONT.display,
        fontSize: "24px",
        color: COLORS.parchmentCss,
      })
      .setOrigin(1, 0);
    this.hud.add([title, tierLabel]);

    // Crowns purse — a real button beside the gear; opens the Royal Mint.
    const crowns = getProfile().crowns ?? 0;
    this.hud.add(
      makeButton(this, {
        x: VIEW.width - 148, y: 8, width: 92, height: 40,
        label: `👑 ${crowns}`, fontSize: 18,
        fill: COLORS.panelLight,
        onTap: () => this.openStore(),
      }),
    );

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
          .text(VIEW.width - 160, 40, badges.join("   "), {
            fontFamily: FONT.family,
            fontSize: "14px",
            color: COLORS.goldCss,
          })
          .setOrigin(1, 0),
      );
    }

    // Settings gear — opens the settings/achievements sheet.
    const gearArt = hasArt(this, "icon_gear");
    this.hud.add(
      makeButton(this, {
        x: VIEW.width - 48,
        y: 8,
        width: 40,
        height: 40,
        label: gearArt ? "" : "⚙",
        fontSize: 22,
        fill: COLORS.panelLight,
        onTap: () => this.openSettings(),
      }),
    );
    if (gearArt) {
      const g = artImage(this, "icon_gear", VIEW.width - 28, 28, 26, 26);
      if (g) this.hud.add(g);
    }

    // Resource row, each with tomorrow-you's expected daily movement beneath —
    // the honest ledger (events excluded; the danger bars cover those).
    const fc = projectDay(s);
    const chips: Array<[string, string, string, string, number | null]> = [
      ["🪙", "icon_coin", `${Math.round(r.coin)}`, COLORS.goldCss, fc.coin],
      ["🍖", "icon_food_bread_meat", `${round1(r.food)}`, COLORS.parchmentCss, fc.food],
      ["🪵", "icon_firewood", `${round1(r.firewood)}`, COLORS.parchmentCss, fc.firewood],
      ["🪣", "icon_bucket", `${round1(r.buckets)}`, COLORS.parchmentCss, fc.buckets],
      ["👤", "icon_population", `${sum.living}/${s.cellCapacity}`, COLORS.parchmentCss, null],
    ];
    const chipW = VIEW.width / chips.length;
    chips.forEach(([emoji, artKey, val, color, delta], i) => {
      const cx = i * chipW + chipW / 2;
      const icon = artImage(this, artKey, cx - 46, 71, 32, 32);
      if (icon) {
        this.hud.add(icon);
        this.hud.add(
          this.add
            .text(cx - 26, 56, val, {
              fontFamily: FONT.family,
              fontSize: "24px",
              color,
            })
            .setOrigin(0, 0),
        );
      } else {
        this.hud.add(
          this.add
            .text(cx, 58, `${emoji}${val}`, {
              fontFamily: FONT.family,
              fontSize: "22px",
              color,
            })
            .setOrigin(0.5, 0),
        );
      }
      if (delta !== null) {
        const d = Math.round(delta * 10) / 10;
        this.hud.add(
          this.add
            .text(cx, 84, `${d > 0 ? "+" : ""}${d}/d`, {
              fontFamily: FONT.family,
              fontSize: "14px",
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

    // Tab bar — painted icons beside the labels when the art is loaded.
    const tabs: Array<[Tab, string, string, string]> = [
      ["keep", "🏰", "icon_keep_tower", "Keep"],
      ["cells", "🔒", "icon_lock", "Cells"],
      ["offers", "📜", "icon_scroll_offers", `Offers (${s.offers.length})`],
      ["market", "⚒", "icon_anvil_market", "Market"],
    ];
    const tabW = VIEW.width / tabs.length;
    tabs.forEach(([tab, emoji, artKey, label], i) => {
      const active = this.activeTab === tab;
      const withArt = hasArt(this, artKey);
      this.hud.add(
        makeButton(this, {
          x: i * tabW,
          y: 156,
          width: tabW,
          height: 56,
          // Icon image replaces the emoji; nudge the text right to make room.
          label: withArt ? `     ${label}` : `${emoji} ${label}`,
          fontSize: 17,
          fill: active ? COLORS.gold : COLORS.panelLight,
          textColor: active ? COLORS.inkCss : COLORS.parchmentCss,
          onTap: () => {
            if (this.activeTab === tab) return;
            this.activeTab = tab;
            this.renderAll();
            this.juice.slideIn(this.content);
          },
        }),
      );
      if (withArt) {
        const approxTextW = label.length * 10.2 + 50;
        const iconX = i * tabW + tabW / 2 - approxTextW / 2 + 14;
        const icon = artImage(this, artKey, iconX, 156 + 28, 28, 28);
        if (icon) this.hud.add(icon);
      }
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
    // The First Decrees strip claims a slim band under the tabs while active.
    this.contentTop = 228;
    if (ftueActive()) {
      const strip = buildDecreeStrip(this, 228, () => this.renderContent());
      if (strip) {
        this.content.add(strip);
        this.contentTop = 228 + 52;
      }
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

  /** Ambient life: a random inmate mutters now and then — a parchment bubble
   * that drifts and fades. Pure presentation (UI-side randomness is fine). */
  private ambientMutter(): void {
    const s = this.state;
    if (!s || s.gameOver || s.pendingDecision || getSettings().reducedMotion) return;
    // Only where prisoners are on screen, and never over an open sheet.
    if (this.activeTab !== "keep" && this.activeTab !== "cells") return;
    const overlayDepths = new Set([820, 845, 850, 860, 870, 880]);
    const overlayOpen = this.children.list.some(
      (c) =>
        overlayDepths.has((c as Phaser.GameObjects.Container).depth) &&
        (c as Phaser.GameObjects.Container).length > 0,
    );
    if (overlayOpen) return;
    const living = s.prisoners.filter((p) => p.alive);
    if (living.length === 0) return;
    const p = living[Math.floor(Math.random() * living.length)];
    const pool =
      p.unrest > 60
        ? ["They'll regret these bars…", "One spark. That's all it takes.", "I hear the yard whispering."]
        : p.health < 40
          ? ["Cough… the cold's in my chest.", "A crust of bread, warden?", "The straw is damp again."]
          : ["Another day, another groat for the crown.", "The smith's fire keeps me warm at least.", "I dreamt of the open road.", "The warders cheat at dice."];
    const text = `${p.name.split(" ")[0]}: “${pool[Math.floor(Math.random() * pool.length)]}”`;
    const bx = 40 + Math.random() * (VIEW.width - 360);
    const by = this.contentTop + 40 + Math.random() * 120;
    const bubble = this.add
      .text(bx, by, text, {
        fontFamily: FONT.family,
        fontSize: "13px",
        color: COLORS.inkCss,
        backgroundColor: "#e8d8b0",
        padding: { x: 8, y: 5 },
      })
      .setAlpha(0)
      .setDepth(700);
    this.tweens.add({
      targets: bubble,
      alpha: 0.95,
      y: by - 8,
      duration: 350,
      yoyo: false,
      onComplete: () => {
        this.tweens.add({
          targets: bubble,
          alpha: 0,
          y: by - 26,
          delay: 2600,
          duration: 700,
          onComplete: () => bubble.destroy(),
        });
      },
    });
  }

  private buildKeepTab(): void {
    const s = this.state;
    const postcardBottom = this.buildKeepPostcard(this.contentTop);
    const stripBottom = this.buildStatusStrip(postcardBottom);
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
      this.add.text(16, stripBottom, "Tap a prisoner for their dossier:", {
        fontFamily: FONT.medieval,
        fontSize: "19px",
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

  /**
   * The living keep postcard: your keep, painted, at your tier — the light
   * shifting with the in-game hour (day → dusk → night) and snow settling in
   * winter. Returns the y below it; renders nothing if the art is missing.
   */
  private buildKeepPostcard(y: number): number {
    const s = this.state;
    const theme = this.activeTheme();
    const key = theme.phaseOverride
      ? `ext_${s.tier}_${theme.phaseOverride}`
      : keepExteriorKey(s.tier, s.hour, s.winterDaysLeft > 0);
    const w = VIEW.width - 32;
    const h = 158;
    const img = artCover(this, key, 16, y, w, h, 0.62);
    if (!img) return y;
    this.content.add(img);

    // Winter: drifting snow, additively blended so the dark sheet vanishes.
    if (s.winterDaysLeft > 0 && hasArt(this, "vfx_snowfall")) {
      const snow = this.add
        .tileSprite(16, y, w, h, "vfx_snowfall")
        .setOrigin(0, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.55);
      this.content.add(snow);
      if (!getSettings().reducedMotion) {
        this.tweens.add({
          targets: snow,
          tilePositionY: -512,
          duration: 14000,
          repeat: -1,
        });
      }
    }

    // Torch sconces flanking the frame, alive after dusk.
    if (this.anims.exists("vfx_torch_flame") && s.hour >= 17 && !getSettings().reducedMotion) {
      for (const tx of [16 + 26, 16 + w - 26]) {
        const torch = this.add.sprite(tx, y + h - 24, "vfx_torch_flame").setScale(0.42);
        torch.play({ key: "vfx_torch_flame", startFrame: tx > 100 ? 3 : 0 });
        this.content.add(torch);
      }
    }

    // A quiet caption strip anchors the painting to the game state.
    this.content.add(
      this.add
        .rectangle(16, y + h - 26, w, 26, COLORS.shadow, 0.55)
        .setOrigin(0, 0),
    );
    this.content.add(
      this.add.text(24, y + h - 22, `${tierTitle(s.tier)} — ${s.keepName}`, {
        fontFamily: FONT.family,
        fontSize: "13px",
        color: COLORS.parchmentCss,
      }),
    );
    this.content.add(
      this.add
        .rectangle(16, y, w, h)
        .setOrigin(0, 0)
        .setStrokeStyle(2, theme.accentColor ?? COLORS.gold, 0.7),
    );
    return y + h + 10;
  }

  /** Warden morality (diverging bar) + honest next-day danger forecast. */
  private buildStatusStrip(y: number): number {
    const s = this.state;
    const w = VIEW.width - 32;
    const h = 132;
    const panel = makePanel(this, 16, y, w, h);

    // ── Morality ──
    const scalesIcon = artImage(this, "icon_scales_morality", 24, 18, 24, 24);
    if (scalesIcon) panel.add(scalesIcon);
    panel.add(
      this.add.text(scalesIcon ? 42 : 12, 8, `${scalesIcon ? "" : "⚖  "}Standing: ${moralityStanding(s.morality)}`, {
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
    const items: Array<[string, string, number]> = [
      ["Riot", "icon_riot_fist", dangers.riot],
      ["Fire", "icon_flame", dangers.fire],
      ["Sick", "icon_plague_rat", dangers.disease],
      ["Escape", "icon_ladder_escape", dangers.escape],
    ];
    const colW = (w - 24) / items.length;
    items.forEach(([label, iconKey, p], i) => {
      const cxi = 12 + i * colW;
      const trackW = colW - 14;
      const dIcon = artImage(this, iconKey, cxi + 10, 92, 20, 20);
      if (dIcon) panel.add(dIcon);
      panel.add(
        this.add.text(dIcon ? cxi + 24 : cxi, 84, label, { fontFamily: FONT.family, fontSize: "15px", color: COLORS.parchmentCss }),
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
    panel.add(this.add.rectangle(10, 10, 8, h - 20, sev).setOrigin(0, 0));

    // Portrait in a rarity frame — the inmate at a glance.
    const portrait = artImage(this, prisonerPortraitKey(p), 58, h / 2, 58, 58);
    let textX = 34;
    if (portrait) {
      panel.add(portrait);
      const frame = artImage(this, rarityFrameKey(p.rarity), 58, h / 2, 72, 72);
      if (frame) panel.add(frame);
      textX = 102;
    }

    panel.add(
      this.add.text(textX, 6, `${p.name}`, {
        fontFamily: FONT.medieval,
        fontSize: "21px",
        // Name tinted by rarity — the notoriety of the inmate at a glance.
        color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
      }),
    );
    panel.add(
      this.add.text(textX, 32, `◆ ${p.rarity}  •  ${p.severity}  •  ${p.sentenceDays}d left  •  ${cellName(p)}`, {
        fontFamily: FONT.family,
        fontSize: "14px",
        color: COLORS.neutralCss,
      }),
    );

    // Health + unrest bars.
    panel.add(this.add.text(textX, 54, "HP", { fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, textX + 30, 56, 100, 12, p.health / 100, COLORS.good));
    panel.add(this.add.text(textX + 142, 54, "Unrest", { fontFamily: FONT.family, fontSize: "13px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, textX + 200, 56, 100, 12, p.unrest / 100, COLORS.bad));

    // Labour badge (the whole card is tappable to cycle it).
    const laborIcon = artImage(this, LABOR_ICON_KEY[p.assignment], w - 52, h / 2 - 14, 30, 30);
    if (laborIcon) {
      panel.add(laborIcon);
      panel.add(
        this.add
          .text(w - 52, h / 2 + 16, p.assignment === "none" ? "resting" : p.assignment, {
            fontFamily: FONT.family,
            fontSize: "12px",
            color: COLORS.goldCss,
          })
          .setOrigin(0.5, 0.5),
      );
    } else {
      panel.add(
        this.add
          .text(w - 16, h / 2, `${LABOR_ICON[p.assignment]} ${p.assignment}`, {
            fontFamily: FONT.family,
            fontSize: "18px",
            color: COLORS.goldCss,
          })
          .setOrigin(1, 0.5),
      );
    }

    const hit = this.add
      .rectangle(0, 0, w, h, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => this.openPrisonerSheet(p));
    panel.add(hit);
    return panel;
  }

  /**
   * The prisoner dossier — tap any inmate anywhere and their whole story
   * opens: portrait in rarity frame, temperament, sentence, earnings, and a
   * DIRECT labour picker (research: tap-anything inspection beats blind
   * cycling). Replaces the old tap-to-cycle interaction.
   */
  openPrisonerSheet(p: Prisoner): void {
    const layer = this.add.container(0, 0).setDepth(820);
    const close = () => {
      layer.destroy();
      this.renderHud();
      this.renderContent();
    };
    const backdrop = this.add
      .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.82)
      .setOrigin(0, 0)
      .setInteractive();
    backdrop.on("pointerup", close); // tap outside to dismiss
    layer.add(backdrop);

    const w = VIEW.width - 72;
    const h = 640;
    const py = (VIEW.height - h) / 2;
    const panel = makePanel(this, 36, py, w, h);
    panel.add(
      this.add.rectangle(0, 0, w, 4, COLORS.severity[p.severity] ?? COLORS.steel).setOrigin(0, 0),
    );

    const portrait = artImage(this, prisonerPortraitKey(p), w / 2, 118, 170, 170);
    if (portrait) {
      panel.add(portrait);
      const frame = artImage(this, rarityFrameKey(p.rarity), w / 2, 118, 206, 206);
      if (frame) panel.add(frame);
    }
    panel.add(
      this.add
        .text(w / 2, 232, p.name, {
          fontFamily: FONT.display,
          fontSize: "32px",
          color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
        })
        .setOrigin(0.5, 0),
    );
    const trait = traitDef(p.trait);
    panel.add(
      this.add
        .text(w / 2, 278, `${p.rarity} ${p.severity}${trait ? `  ·  ${trait.name}` : ""}`, {
          fontFamily: FONT.medieval,
          fontSize: "17px",
          color: COLORS.neutralCss,
        })
        .setOrigin(0.5, 0),
    );
    if (trait) {
      panel.add(
        this.add
          .text(w / 2, 302, trait.blurb, {
            fontFamily: FONT.family,
            fontSize: "13px",
            color: COLORS.neutralCss,
            align: "center",
            wordWrap: { width: w - 60 },
          })
          .setOrigin(0.5, 0),
      );
    }

    // The ledger row: what they pay, how long they stay, where they sleep.
    panel.add(
      this.add
        .text(w / 2, 336, `🪙 ${p.dailyPayout}/day   ·   ${p.sentenceDays}d left   ·   ${cellName(p)}`, {
          fontFamily: FONT.family,
          fontSize: "16px",
          color: COLORS.goldCss,
        })
        .setOrigin(0.5, 0),
    );

    // Vitals.
    panel.add(this.add.text(28, 372, "Health", { fontFamily: FONT.family, fontSize: "14px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, 100, 374, w - 128, 14, p.health / 100, COLORS.good));
    panel.add(this.add.text(28, 398, "Unrest", { fontFamily: FONT.family, fontSize: "14px", color: COLORS.neutralCss }));
    panel.add(makeBar(this, 100, 400, w - 128, 14, p.unrest / 100, COLORS.bad));

    // Direct labour picker — five stations, current one lit.
    panel.add(
      this.add.text(28, 432, "Assignment", {
        fontFamily: FONT.medieval,
        fontSize: "18px",
        color: COLORS.goldCss,
      }),
    );
    const bw = (w - 56 - 4 * 8) / 5;
    LABOR_CYCLE.forEach((job, i) => {
      const bx = 28 + i * (bw + 8);
      const active = p.assignment === job;
      panel.add(
        makeButton(this, {
          x: bx, y: 460, width: bw, height: 74,
          label: `\n${job === "none" ? "rest" : job.slice(0, 8)}`,
          fontSize: 12,
          fontFamily: FONT.family,
          fill: active ? COLORS.gold : COLORS.panelLight,
          textColor: active ? COLORS.inkCss : COLORS.parchmentCss,
          onTap: () => {
            applyAction(this.state, { type: "assignLabor", prisonerId: p.id, assignment: job });
            this.persist();
            this.decree("assignLabour");
            close();
            this.openPrisonerSheet(p); // reopen refreshed — instant feedback
          },
        }),
      );
      const jobIcon = artImage(this, LABOR_ICON_KEY[job], bx + bw / 2, 484, 30, 30);
      if (jobIcon) panel.add(jobIcon);
    });

    panel.add(
      makeButton(this, {
        x: 28, y: h - 70, width: w - 56, height: 54,
        label: "Close the Dossier", fontSize: 19,
        onTap: close,
      }),
    );
    layer.add(panel);
    if (!getSettings().reducedMotion) {
      panel.setScale(0.94).setAlpha(0);
      this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 180, ease: "Back.easeOut" });
    }
  }

  /**
   * THE CELL BLOCK — drawn as an actual jail: a torchlit central corridor,
   * cells flanking it behind bars, warders on patrol, the hearth at the head.
   * Tap an occupied cell to open the inmate's dossier. Overflow waits in the
   * yard. (Research directive: "the scene IS the screen".)
   */
  private buildCellsTab(): void {
    const s = this.state;
    const living = s.prisoners.filter((p) => p.alive);
    const byCell = new Map<number, Prisoner>();
    for (const p of living) {
      if (typeof p.cell === "number") byCell.set(p.cell, p);
    }

    this.content.add(
      this.add.text(16, this.contentTop, "The cell block — tap an inmate for their dossier.", {
        fontFamily: FONT.medieval,
        fontSize: "17px",
        color: COLORS.neutralCss,
      }),
    );

    const cap = s.cellCapacity;
    const rows = Math.ceil(cap / 2);
    const gridTop = this.contentTop + 28;
    const yard = living.filter((p) => typeof p.cell !== "number" || p.cell >= cap);
    const yardH = yard.length > 0 ? 64 : 0;
    const availH = this.contentBottom - gridTop - yardH - 8;
    const gap = 6;
    const cellH = Math.max(84, Math.min(136, Math.floor(availH / rows) - gap));
    const BARS_W = 14;
    const CORRIDOR_W = 92;
    const cellW = (VIEW.width - 32 - CORRIDOR_W - 2 * BARS_W) / 2;
    const corridorX = 16 + cellW + BARS_W;
    const blockH = rows * (cellH + gap) - gap;
    const winter = s.winterDaysLeft > 0;
    const floorKeys = winter
      ? ["tile_snow_dusted_stone_floor"]
      : ["tile_stone_floor_plain", "tile_stone_floor_cracked", "tile_stone_floor_mossy"];

    // ── The corridor: worn stone, the hearth at its head, warders walking. ──
    // One continuous slice of worn stone (cover-cropped, no tiling) — any
    // repeating pattern down the shaft reads as a ladder, caught twice in
    // visual review.
    const corridorArt = artCover(this, "tile_stone_floor_mossy", corridorX, gridTop, CORRIDOR_W, blockH, 0.5);
    if (corridorArt) {
      corridorArt.setTint(0x9f9f9f);
      this.content.add(corridorArt);
    } else {
      this.content.add(
        this.add.rectangle(corridorX, gridTop, CORRIDOR_W, blockH, COLORS.panelLight).setOrigin(0, 0),
      );
    }
    // Soft edge shadows ground the walkway between the cell walls.
    this.content.add(
      this.add.rectangle(corridorX, gridTop, 6, blockH, COLORS.shadow, 0.45).setOrigin(0, 0),
    );
    this.content.add(
      this.add.rectangle(corridorX + CORRIDOR_W - 6, gridTop, 6, blockH, COLORS.shadow, 0.45).setOrigin(0, 0),
    );
    if (this.anims.exists("vfx_torch_flame") && !getSettings().reducedMotion) {
      const torch = this.add
        .sprite(corridorX + CORRIDOR_W / 2, gridTop + 22, "vfx_torch_flame")
        .setScale(0.34);
      torch.play("vfx_torch_flame");
      this.content.add(torch);
    }
    // Patrolling guards — the artist's own figures walking the corridor
    // (down-facing frames on the way down, tabard-back frames on the way up).
    const patrols = Math.min(3, s.guards.length);
    for (let g = 0; g < patrols; g++) {
      const gx = corridorX + CORRIDOR_W / 2 + (g - 1) * 24;
      if (this.anims.exists("guard_walk_down")) {
        const spr = this.add.sprite(gx, gridTop + 60 + g * 30, "sprite_guard").setScale(0.44);
        spr.play("guard_walk_down");
        this.content.add(spr);
        if (!getSettings().reducedMotion && blockH > 200) {
          this.tweens.add({
            targets: spr,
            y: gridTop + blockH - 50,
            duration: 9000 + g * 2300,
            delay: g * 1300,
            yoyo: true,
            repeat: -1,
            ease: "Linear",
            onYoyo: () => spr.play("guard_walk_up"),
            onRepeat: () => spr.play("guard_walk_down"),
          });
        }
      } else {
        const mark = this.add
          .text(gx, gridTop + 70, "⚔", {
            fontFamily: FONT.family,
            fontSize: "22px",
            color: COLORS.steelCss,
          })
          .setOrigin(0.5, 0.5);
        this.content.add(mark);
      }
    }
    if (s.guards.length === 0) {
      this.content.add(
        this.add
          .text(corridorX + CORRIDOR_W / 2, gridTop + 70, "no\nwatch!", {
            fontFamily: FONT.family,
            fontSize: "13px",
            color: COLORS.badCss,
            align: "center",
          })
          .setOrigin(0.5, 0),
      );
    }

    // ── The cells, flanking the corridor behind bars. ──
    for (let i = 0; i < cap; i++) {
      const row = Math.floor(i / 2);
      const leftSide = i % 2 === 0;
      const x = leftSide ? 16 : corridorX + CORRIDOR_W + BARS_W;
      const y = gridTop + row * (cellH + gap);
      const barsX = leftSide ? 16 + cellW : corridorX + CORRIDOR_W;
      const p = byCell.get(i);

      // Cell interior: stone floor (dim when empty), straw for the occupied.
      const floorKey = floorKeys[i % floorKeys.length];
      if (hasArt(this, floorKey)) {
        const floor = this.add
          .image(x, y, floorKey)
          .setOrigin(0, 0)
          .setDisplaySize(cellW, cellH)
          .setTint(p ? 0x9a9a9a : 0x565656);
        this.content.add(floor);
      } else {
        this.content.add(
          this.add.rectangle(x, y, cellW, cellH, p ? COLORS.panel : COLORS.shadow).setOrigin(0, 0),
        );
      }
      if (p && hasArt(this, "tile_straw_bedding")) {
        const straw = this.add
          .image(leftSide ? x + 6 : x + cellW - 40, y + cellH - 40, "tile_straw_bedding")
          .setOrigin(0, 0)
          .setDisplaySize(34, 34)
          .setAlpha(0.9);
        this.content.add(straw);
      }

      // The cell's corridor wall: solid dark stone with a barred GATE in the
      // middle — a doorway, not a full-height rail (full-height light strips
      // read as ladder rails down the shaft; caught in visual review).
      this.content.add(
        this.add.rectangle(barsX, y, BARS_W, cellH, 0x1c1712, 1).setOrigin(0, 0),
      );
      const gateH = Math.min(40, Math.round(cellH * 0.42));
      const gateY = y + Math.round((cellH - gateH) / 2);
      this.content.add(
        this.add.rectangle(barsX, gateY, BARS_W, gateH, COLORS.panelLight, p ? 0.9 : 0.45).setOrigin(0, 0),
      );
      for (const bx of [3, 7, 11]) {
        this.content.add(
          this.add.rectangle(barsX + bx, gateY + 1, 2, gateH - 2, COLORS.shadow, 0.95).setOrigin(0, 0),
        );
      }

      this.content.add(
        this.add
          .text(leftSide ? x + 6 : x + cellW - 6, y + 4, `${i + 1}`, {
            fontFamily: FONT.display,
            fontSize: "18px",
            color: COLORS.neutralCss,
          })
          .setOrigin(leftSide ? 0 : 1, 0)
          .setAlpha(0.85),
      );

      if (p) {
        const px = x + cellW / 2;
        const py = y + Math.min(cellH / 2 - 6, 40);
        const portrait = artImage(this, prisonerPortraitKey(p), px, py, 56, 56);
        if (portrait) {
          this.content.add(portrait);
          const frame = artImage(this, rarityFrameKey(p.rarity), px, py, 70, 70);
          if (frame) this.content.add(frame);
        }
        this.content.add(
          this.add
            .text(px, y + cellH - 26, clip(p.name, Math.floor((cellW - 12) / 8)), {
              fontFamily: FONT.family,
              fontSize: "13px",
              color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
            })
            .setOrigin(0.5, 0)
            .setShadow(1, 1, "#000000", 2),
        );
        const jobIcon = artImage(this, LABOR_ICON_KEY[p.assignment], px - 26, y + cellH - 4 - 8, 16, 16);
        if (jobIcon) this.content.add(jobIcon);
        this.content.add(
          this.add
            .text(jobIcon ? px - 16 : px, y + cellH - 14, p.assignment === "none" ? "resting" : p.assignment, {
              fontFamily: FONT.family,
              fontSize: "10px",
              color: COLORS.goldCss,
            })
            .setOrigin(jobIcon ? 0 : 0.5, 0.5)
            .setShadow(1, 1, "#000000", 2),
        );
        const hit = this.add
          .rectangle(x, y, cellW + BARS_W, cellH, 0xffffff, 0.001)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerup", () => this.openPrisonerSheet(p));
        this.content.add(hit);
      } else {
        this.content.add(
          this.add
            .text(x + cellW / 2, y + cellH / 2, "empty", {
              fontFamily: FONT.family,
              fontSize: "12px",
              color: COLORS.neutralCss,
            })
            .setOrigin(0.5, 0.5)
            .setAlpha(0.6),
        );
      }
    }

    if (yard.length > 0) {
      const yardY = gridTop + blockH + 8;
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
      panel.add(this.add.rectangle(12, 40, 8, 96, sev).setOrigin(0, 0));

      // The offered inmate, framed by their notoriety.
      const portrait = artImage(this, prisonerPortraitKey(p), 74, 88, 88, 88);
      let tx = 36;
      if (portrait) {
        panel.add(portrait);
        const frame = artImage(this, rarityFrameKey(p.rarity), 74, 88, 106, 106);
        if (frame) panel.add(frame);
        tx = 136;
      }
      panel.add(
        this.add.text(tx, 40, `${p.name}`, {
          fontFamily: FONT.family,
          fontSize: "21px",
          color: COLORS.rarity[p.rarity] ?? COLORS.parchmentCss,
        }),
      );
      const pip = artImage(this, rarityPipKey(p.rarity), tx + 10, 80, 20, 20);
      if (pip) panel.add(pip);
      panel.add(
        this.add.text(pip ? tx + 24 : tx, 70, `${pip ? "" : "◆ "}${p.rarity}  •  ${p.severity}  •  sentence ${p.sentenceDays}d`, {
          fontFamily: FONT.family,
          fontSize: "15px",
          color: COLORS.neutralCss,
        }),
      );
      panel.add(
        this.add.text(tx, 96, `Pays ${offer.dailyPayout}/day  •  bounty +${offer.acceptBounty}`, {
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
          label: `Hire Guard  ${hireCost}🪙`, fontSize: 16,
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
    const BUILDING_ROWS: Array<[Parameters<typeof costs.build>[0], string, string, string]> = [
      ["infirmary", "🏥 Infirmary", "icon_infirmary_cross", "heals every inmate daily"],
      ["chapel", "⛪ Chapel", "icon_chapel", "calms the cells daily"],
      ["gallows", "🪢 Gallows", "icon_noose", "fear: quiet cells, fewer escapes — hardens your soul"],
      ["walls", "🧱 High Walls", "icon_wall", "halves escape attempts"],
      ["barracks", "🛏 Barracks", "", `bunks for ${BALANCE.buildings.barracks.quarters} more guards — crowding sours the corps`],
      ["tavern", "🍺 Tavern", "icon_dice", "ale and dice each evening lift the guards' spirits"],
    ];
    for (const [id, label, iconKey, hint] of BUILDING_ROWS) {
      const built = s.buildings[id];
      const cost = costs.build(id, s);
      const panel2 = makePanel(this, 16, y, w, 66);
      const bIcon = iconKey ? artImage(this, iconKey, 34, 33, 36, 36) : null;
      if (bIcon) panel2.add(bIcon);
      const lx = bIcon ? 60 : 16;
      panel2.add(
        this.add.text(lx, 10, (bIcon ? label.slice(label.indexOf(" ") + 1) : label) + (built ? "  ✓ built" : ""), {
          fontFamily: FONT.family, fontSize: "17px",
          color: built ? COLORS.goodCss : COLORS.parchmentCss,
        }),
      );
      panel2.add(
        this.add.text(lx, 36, hint, {
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
      `Guards (${s.guards.length})  •  🛏 ${s.guards.length}/${bunks} bunks`,
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
    const recent = this.state.log.slice(-Math.floor((h - 36) / 24));
    recent.forEach((entry, i) => {
      const color =
        entry.tone === "good" ? COLORS.goodCss : entry.tone === "bad" ? COLORS.badCss : COLORS.neutralCss;
      // One entry, one line: clip instead of wrapping, so rows can never
      // overlap the fixed 20px line pitch below the prisoner cards.
      panel.add(
        this.add.text(12, 36 + i * 24, clip(`d${entry.day}: ${entry.text}`, 66), {
          fontFamily: FONT.family,
          fontSize: "15px",
          color,
        }),
      );
    });
    this.content.add(panel);
  }

  private renderEndDayBar(): void {
    const evening = this.state.hour >= BALANCE.time.dayEndHour;
    const bar = makeButton(this, {
      x: 16,
      y: VIEW.height - 84,
      width: VIEW.width - 32,
      height: 68,
      label: evening ? "🌙  Retire for the Night" : "⏩  Skip to Evening",
      fontSize: 26,
      fill: evening ? COLORS.moss : COLORS.panelLight,
      textColor: evening ? COLORS.inkCss : COLORS.parchmentCss,
      onTap: () => (evening ? this.endDay() : this.skipToEvening()),
    });
    this.content.add(bar);
    // At the bell, the button breathes — the eye is drawn to the one action left.
    if (evening && !getSettings().reducedMotion) {
      this.tweens.add({
        targets: bar,
        alpha: { from: 1, to: 0.75 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
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
    this.decree("skipToEvening");
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
      this.decree("retire");
      // The tick has landed — safe to accept the next End Day. The feedback
      // below is fire-and-forget visuals only.
      this.dayInFlight = false;
    });

    // Reveal the day's consequences once the wipe lifts.
    const delay = getSettings().reducedMotion ? 0 : 620;
    this.time.delayedCall(delay, () => this.dayFeedback(beforeCoin));
  }

  /** Play a one-shot VFX animation at (x, y); silently skips if not loaded.
   * Also skips while a decision modal is up — the choice owns the screen. */
  private playBurst(key: string, x: number, y: number, scale = 1): void {
    if (!this.anims.exists(key) || getSettings().reducedMotion) return;
    if (this.state?.pendingDecision) return;
    const spr = this.add.sprite(x, y, key).setScale(scale).setDepth(920);
    spr.play(key);
    spr.once("animationcomplete", () => spr.destroy());
  }

  /** Screen-shake, flashes, floating coin, and a toast for the day's outcome. */
  private dayFeedback(beforeCoin: number): void {
    const deaths = this.state.lastEvents.reduce((n, e) => n + e.deaths, 0);
    if (deaths > 0) {
      this.juice.shake(420, 0.015);
      this.juice.flash(COLORS.blood);
    } else if (this.state.lastEvents.some((e) => e.kind === "fire")) {
      this.juice.shake(300, 0.01);
      this.playBurst("vfx_fire_burst", VIEW.width / 2, VIEW.height / 2 - 120, 1.4);
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
    if (res.ok && action.type === "build") {
      this.playBurst("vfx_smoke_puff", VIEW.width / 2, VIEW.height / 2, 1.3);
    }
    // First Decrees hooks — the tutorial rewards REAL actions.
    if (res.ok && action.type === "acceptOffer") this.decree("acceptPrisoner");
    if (res.ok && action.type === "buyResource") this.decree("buyProvisions");
    const coinDelta = Math.round(this.state.resources.coin - beforeCoin);
    if (coinDelta !== 0) {
      this.juice.floatNumber(
        this.coinChip.x,
        this.coinChip.y,
        `${coinDelta > 0 ? "+" : ""}${coinDelta}`,
        coinDelta > 0 ? COLORS.goldCss : COLORS.bloodCss,
      );
      if (coinDelta > 0) {
        this.playBurst("vfx_coin_sparkle", this.coinChip.x, this.coinChip.y, 0.8);
      }
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
          x: 16, y: bottomY + 32, width: w - 32, height: 50,
          label: `\u{1F451}  The Royal Mint  (${getProfile().crowns ?? 0} crowns)`, fontSize: 17,
          fill: COLORS.panelLight,
          onTap: () => {
            layer.destroy();
            this.openStore();
          },
        }),
      );
      panel.add(
        makeButton(this, {
          x: 16, y: bottomY + 94, width: (w - 44) / 2, height: 52,
          label: "\u269c A New Reign", fontSize: 17,
          fill: COLORS.blood,
          onTap: () => {
            layer.destroy();
            this.openSetup(true);
          },
        }),
      );
      panel.add(
        makeButton(this, {
          x: 16 + (w - 44) / 2 + 12, y: bottomY + 94, width: (w - 44) / 2, height: 52,
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

    // Header art: a painted banner for the situation, or the legend's own
    // portrait when a named inmate's story takes the night.
    const legendId = d.kind === "legend" ? String(d.context.legendId ?? "") : "";
    const bannerKey = d.kind === "legend" ? `legend_${legendId}` : decisionBannerKey(d.kind);
    const bannerAvailable = hasArt(this, bannerKey);
    const bannerH = bannerAvailable
      ? d.kind === "legend"
        ? 210
        : Math.round((panelW - 24) * (484 / 1328))
      : 0;

    const panelH = 150 + bannerH + d.options.length * (optH + 14);
    const px = 28;
    const py = Math.max(40, (VIEW.height - panelH) / 2);
    const panel = makePanel(this, px, py, panelW, panelH, DECISION_TITLE[d.kind] ?? "A Hard Choice");

    if (bannerAvailable) {
      if (d.kind === "legend") {
        const lp = artImage(this, bannerKey, panelW / 2, 40 + bannerH / 2, bannerH - 8, bannerH - 8);
        if (lp) panel.add(lp);
      } else {
        const art = artCover(this, bannerKey, 12, 40, panelW - 24, bannerH - 6, 0.5);
        if (art) panel.add(art);
        panel.add(
          this.add
            .rectangle(12, 40, panelW - 24, bannerH - 6)
            .setOrigin(0, 0)
            .setStrokeStyle(2, COLORS.gold, 0.5),
        );
      }
    }

    panel.add(
      this.add.text(16, 44 + bannerH, d.prompt, {
        fontFamily: FONT.family,
        fontSize: "18px",
        color: COLORS.parchmentCss,
        align: "left",
        wordWrap: { width: panelW - 32 },
      }),
    );

    d.options.forEach((o, i) => {
      const oy = 118 + bannerH + i * (optH + 14);
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
        if (coinDelta > 0) {
          this.playBurst("vfx_coin_sparkle", this.coinChip.x, this.coinChip.y, 0.8);
        }
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
    // A finished daily challenge pays its crown bounty (idempotent per date).
    if (s.dailyChallenge) {
      const paid = grantDailyCrowns(s.dailyChallenge);
      if (paid > 0) this.toast(`\u{1F4C5} Daily challenge complete \u2014 +${paid} \u{1F451}`, COLORS.goldCss);
    }

    this.content.add(
      this.add.rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.92).setOrigin(0, 0),
    );

    // The reign, painted: each ending has its own commissioned vignette.
    let y = 40;
    const endArt = artCover(this, `end_${ending.id}`, (VIEW.width - 420) / 2, y, 420, 300, 0.4);
    if (endArt) {
      this.content.add(endArt);
      this.content.add(
        this.add
          .rectangle((VIEW.width - 420) / 2, y, 420, 300)
          .setOrigin(0, 0)
          .setStrokeStyle(3, ending.won ? COLORS.gold : COLORS.blood, 0.85),
      );
      y += 316;
    } else {
      y = 120;
    }
    this.content.add(
      this.add
        .text(VIEW.width / 2, y, ending.title, {
          fontFamily: FONT.family,
          fontSize: "32px",
          color: accent,
        })
        .setOrigin(0.5, 0),
    );
    y += 48;
    this.content.add(
      this.add
        .text(VIEW.width / 2, y, ending.text, {
          fontFamily: FONT.family,
          fontSize: "17px",
          color: COLORS.parchmentCss,
          align: "center",
          wordWrap: { width: VIEW.width - 96 },
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0),
    );
    y += endArt ? 128 : 170;

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
