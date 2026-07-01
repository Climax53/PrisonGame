// Headless smoke-test in real Chromium. Boots the built game, drives several
// animated days (waiting for each day-wipe to land), forces a RIOT decision and
// resolves it through the live core, checks for console errors, and writes
// screenshots of normal play and the decision modal. Exits non-zero on failure.

import { chromium } from "playwright";
import { existsSync } from "node:fs";

const URL = process.env.SMOKE_URL ?? "http://localhost:4173/";
const SHOT_PLAY = process.env.SMOKE_SHOT ?? "scripts/screenshot.png";
const SHOT_MODAL = "scripts/screenshot-decision.png";

const errors = [];
const PINNED =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOpts = {
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-swiftshader"],
};
if (existsSync(PINNED)) launchOpts.executablePath = PINNED;
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

// Expose a browser-side helper so page.evaluate/waitForFunction can reach the
// live scene (free variables aren't captured across the Node↔browser boundary).
await page.addInitScript(() => {
  window.scene = () => window.__GAME__.scene.getScene("GameScene");
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(
  () => window.__GAME__?.scene?.getScene("GameScene")?.state,
  { timeout: 15000 },
);

const startDay = await page.evaluate(() => scene().state.day);

// Drive 5 animated days, waiting for each wipe to land (exercises tweens,
// floating numbers, screen effects — all under normal motion).
async function endOneDay() {
  const cur = await page.evaluate(() => scene().state.day);
  await page.evaluate(() => scene().endDay());
  await page.waitForFunction((c) => scene().state.day > c, cur, { timeout: 6000 });
  // Resolve any decision the day raised so the loop can continue.
  const pending = await page.evaluate(() => !!scene().state.pendingDecision);
  if (pending) {
    await page.evaluate(() => scene().resolveDecision(scene().state.pendingDecision.options[0].id));
    await page.waitForFunction(() => !scene().state.pendingDecision, { timeout: 6000 });
  }
}
for (let i = 0; i < 5; i++) await endOneDay();

await page.screenshot({ path: SHOT_PLAY });

// Verify the new systems are live in the running game.
const systems = await page.evaluate(() => {
  const s = scene().state;
  return {
    moralityIsNumber: typeof s.morality === "number",
    prisonersHaveRarity:
      s.prisoners.length === 0 || s.prisoners.every((p) => typeof p.rarity === "string"),
    guardsHaveRarity: s.guards.every((g) => typeof g.rarity === "string"),
  };
});

// Force a riot decision: max unrest, no guards, but keep the keep solvent so a
// riot (not starvation) is what fires. Retry until the modal appears.
let raisedRiot = false;
for (let i = 0; i < 15 && !raisedRiot; i++) {
  await page.evaluate(() => {
    const s = scene().state;
    s.reputation = 85;
    s.resources.food = 500;
    s.resources.firewood = 40;
    s.resources.coin = 800;
    s.guards = [];
    // The starter inmates' short sentences may have expired by now — an empty
    // keep can never riot. Conscript pending offers into the cells and pin
    // long sentences so the roster survives the loop.
    while (s.prisoners.length < 3 && s.offers.length > 0) {
      const offer = s.offers.shift();
      s.prisoners.push(offer.prisoner);
    }
    for (const p of s.prisoners) {
      p.alive = true;
      p.unrest = 100;
      p.sentenceDays = 60;
    }
  });
  const cur = await page.evaluate(() => scene().state.day);
  await page.evaluate(() => scene().endDay());
  await page.waitForFunction((c) => scene().state.day > c, cur, { timeout: 6000 });
  raisedRiot = await page.evaluate(
    () => scene().state.pendingDecision?.kind === "riot",
  );
}

let modalRendered = false;
let resolvedClean = false;
if (raisedRiot) {
  await page.waitForTimeout(400); // let the modal animate in
  modalRendered = await page.evaluate(
    () => scene().children.list.some((c) => c.depth === 800 && c.length > 0),
  );
  await page.screenshot({ path: SHOT_MODAL });
  // Resolve it and confirm the decision clears.
  await page.evaluate(() =>
    scene().resolveDecision(scene().state.pendingDecision.options[0].id),
  );
  resolvedClean = await page.evaluate(() => !scene().state.pendingDecision);
}

// Crushing a riot (options[0]) is a cruel act — morality should have dropped.
const moralityAfterCrush = await page.evaluate(() => scene().state.morality);

// ── Legacy-save migration: forge a v1 save (pre-morality/pre-rarity), reload,
// and require the game to boot from it and play a day without corruption. This
// simulates a player updating the app across the schema change.
const legacy = await page.evaluate(() => {
  const raw = localStorage.getItem("wardens_keep_save_v1");
  const blob = JSON.parse(raw);
  blob.version = 1;
  delete blob.state.morality;
  for (const p of blob.state.prisoners) delete p.rarity;
  for (const g of blob.state.guards) delete g.rarity;
  for (const o of blob.state.offers) delete o.prisoner.rarity;
  blob.state.pendingDecision = undefined;
  localStorage.setItem("wardens_keep_save_v1", JSON.stringify(blob));
  return { savedDay: blob.state.day };
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(
  () => window.__GAME__?.scene?.getScene("GameScene")?.state,
  { timeout: 15000 },
);
const migrated = await page.evaluate(() => {
  const s = scene().state;
  return {
    day: s.day,
    morality: s.morality,
    raritiesOk:
      s.prisoners.every((p) => typeof p.rarity === "string") &&
      s.guards.every((g) => typeof g.rarity === "string"),
  };
});
// Play one day on the migrated save — this is what used to crash.
{
  const cur = await page.evaluate(() => scene().state.day);
  await page.evaluate(() => scene().endDay());
  await page.waitForFunction((c) => scene().state.day > c, cur, { timeout: 6000 });
}
const migratedPlayable = await page.evaluate(
  () => Number.isFinite(scene().state.morality) && Number.isFinite(scene().state.resources.coin),
);

const finalDay = await page.evaluate(() => scene().state.day);
await browser.close();

let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed = true;
};

assert(errors.length === 0, `no console/page errors (saw ${errors.length})`);
if (errors.length) errors.slice(0, 5).forEach((e) => console.log("   ↳", e));
assert(startDay === 1, `game starts on day 1 (got ${startDay})`);
assert(finalDay >= 6, `advanced through animated days (reached day ${finalDay})`);
assert(raisedRiot, "a forced riot raised a decision");
assert(modalRendered, "the decision modal rendered");
assert(resolvedClean, "resolving the decision cleared it");
assert(systems.moralityIsNumber, "morality system is live");
assert(systems.prisonersHaveRarity, "prisoners carry a rarity");
assert(systems.guardsHaveRarity, "guards carry a rarity");
assert(moralityAfterCrush < 0, `crushing a riot lowered morality (got ${moralityAfterCrush})`);
assert(
  migrated.day === legacy.savedDay && migrated.morality === 0 && migrated.raritiesOk,
  `legacy v1 save migrated cleanly (day ${migrated.day}, morality ${migrated.morality})`,
);
assert(migratedPlayable, "migrated legacy save plays a day without corruption");
console.log(`screenshots → ${SHOT_PLAY}, ${SHOT_MODAL}`);

process.exit(failed ? 1 : 0);
