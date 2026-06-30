// One-shot end-to-end verifier: builds the app, serves the production bundle,
// runs the headless browser smoke-test against it, then tears everything down.
// Used by `npm run verify` and by CI. Exits non-zero if any step fails.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const PORT = 4178;
const URL = `http://127.0.0.1:${PORT}/`;

console.log("▶ building…");
await run("npx", ["vite", "build"]);

console.log("▶ starting preview server…");
const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
  stdio: "ignore",
});

let failed = false;
try {
  // Give the static server a moment to bind.
  await sleep(2500);
  console.log("▶ running browser smoke-test…");
  await run("node", ["scripts/smoke.mjs"], { env: { ...process.env, SMOKE_URL: URL } });
  console.log("✓ verify passed");
} catch (err) {
  console.error("✗ verify failed:", err.message);
  failed = true;
} finally {
  preview.kill("SIGTERM");
}

process.exit(failed ? 1 : 0);
