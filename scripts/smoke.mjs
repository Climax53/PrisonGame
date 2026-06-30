// Headless smoke-test: builds are served by vite preview separately; this script
// loads the page in real Chromium, asserts the game boots with no console
// errors, drives several in-game days via the live core, and writes a
// screenshot. Exits non-zero on any failure so CI can gate on it.

import { chromium } from "playwright";
import { existsSync } from "node:fs";

const URL = process.env.SMOKE_URL ?? "http://localhost:4173/";
const OUT = process.env.SMOKE_SHOT ?? "scripts/screenshot.png";

const errors = [];
// Prefer a Chromium pre-installed in this environment (so we don't download a
// version-pinned one); fall back to Playwright's own managed browser in CI.
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

await page.goto(URL, { waitUntil: "networkidle" });

// Wait for the Phaser game and our GameScene to be live.
await page.waitForFunction(
  () => {
    const g = window.__GAME__;
    return g && g.scene && g.scene.getScene("GameScene");
  },
  { timeout: 15000 },
);

// Read initial day, drive 5 days through the real core, assert it advanced.
const result = await page.evaluate(() => {
  const scene = window.__GAME__.scene.getScene("GameScene");
  const startDay = scene["state"].day;
  for (let i = 0; i < 5; i++) scene["endDay"]();
  return {
    startDay,
    endDay: scene["state"].day,
    prisoners: scene["state"].prisoners.length,
    coin: scene["state"].resources.coin,
    logLines: scene["state"].log.length,
  };
});

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed = true;
};

assert(errors.length === 0, `no console/page errors (saw ${errors.length})`);
if (errors.length) errors.slice(0, 5).forEach((e) => console.log("   ↳", e));
assert(result.startDay === 1, `game starts on day 1 (got ${result.startDay})`);
assert(result.endDay === 6, `advanced 5 days to day 6 (got ${result.endDay})`);
assert(result.logLines > 0, `chronicle has entries (${result.logLines})`);
console.log("state after 5 days:", JSON.stringify(result));
console.log(`screenshot → ${OUT}`);

process.exit(failed ? 1 : 0);
