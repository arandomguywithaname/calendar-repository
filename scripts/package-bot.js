/* Builds bot-dist/ — the single-file distribution — and zips it.
   The point of bundling is that the recipient runs `node bot.js` with no
   install step, so a missing dependency cannot make it fail on their machine. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "bot-dist");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);

fs.mkdirSync(out, { recursive: true });

execFileSync(
  path.join(root, "node_modules/.bin/esbuild"),
  [
    "src/bot-server.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    `--define:__BUILD_STAMP__="${stamp}"`,
    `--outfile=${path.join(out, "bot.js")}`,
  ],
  { cwd: root, stdio: "inherit" }
);

// A stray data/ or .env from a test run must not travel with the zip.
for (const stray of ["data", ".env.local"]) {
  fs.rmSync(path.join(out, stray), { recursive: true, force: true });
}

const zip = path.join(root, "channel-digest-bot.zip");
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-q", zip, "."], { cwd: out, stdio: "inherit" });

console.log(`\nbuild ${stamp}`);
for (const file of fs.readdirSync(out)) {
  console.log(`  ${file}  ${fs.statSync(path.join(out, file)).size} bytes`);
}
console.log(`\n${zip}  ${fs.statSync(zip).size} bytes`);
