/* Builds the shipped artefacts.
 *
 *   node scripts/package-bot.js                 -> bot-dist/  (needs Node to run)
 *   node scripts/package-bot.js --target=win    -> a standalone .exe, no Node
 *
 * The bundle step is shared: esbuild produces one CJS file, and `bun build
 * --compile` wraps that file in a runtime when a standalone binary is asked
 * for. The recipient of either artefact installs nothing. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);

const TARGETS = {
  win: { bunTarget: "bun-windows-x64", exe: "channel-digest-bot.exe", zip: "channel-digest-bot-windows.zip", readme: "README-windows.txt" },
  mac: { bunTarget: "bun-darwin-arm64", exe: "channel-digest-bot", zip: "channel-digest-bot-macos.zip", readme: "README-macos.txt" },
  "mac-intel": { bunTarget: "bun-darwin-x64", exe: "channel-digest-bot", zip: "channel-digest-bot-macos-intel.zip", readme: "README-macos.txt" },
  linux: { bunTarget: "bun-linux-x64", exe: "channel-digest-bot", zip: "channel-digest-bot-linux.zip", readme: "README-linux.txt" },
};

const arg = process.argv.find((a) => a.startsWith("--target="));
const target = arg ? arg.slice("--target=".length) : null;

if (target && !TARGETS[target]) {
  console.error(`Unknown target "${target}". Known: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const out = path.join(root, target ? `bot-dist-${target}` : "bot-dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

/* ------------------------------- bundle ---------------------------------- */

const bundle = path.join(root, "build", "bot.bundle.js");
fs.mkdirSync(path.dirname(bundle), { recursive: true });

execFileSync(
  path.join(root, "node_modules/.bin/esbuild"),
  [
    "src/bot-server.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    `--define:__BUILD_STAMP__="${stamp}"`,
    `--outfile=${bundle}`,
  ],
  { cwd: root, stdio: "inherit" }
);

/* ------------------------------- assemble -------------------------------- */

if (target) {
  const spec = TARGETS[target];
  execFileSync(
    "bun",
    ["build", "--compile", `--target=${spec.bunTarget}`, bundle, "--outfile", path.join(out, spec.exe)],
    { cwd: root, stdio: "inherit" }
  );

  const readme = path.join(root, "dist-notes", spec.readme);
  if (fs.existsSync(readme)) fs.copyFileSync(readme, path.join(out, "README.txt"));

  // No .env is shipped: the program asks for the values on first run and
  // writes the file itself. An empty one here would only invite editing.
  pack(out, path.join(root, spec.zip));

  // A compiled binary carries a whole runtime, which zip cannot squeeze under
  // the 30 MiB this gets delivered through — xz can, at the cost of needing
  // Windows 11 or 7-Zip to open.
  if (process.argv.includes("--xz")) {
    const archive = path.join(root, spec.zip.replace(/\.zip$/, ".tar.xz"));
    fs.rmSync(archive, { force: true });
    execFileSync("sh", ["-c", `tar -cf - ${spec.exe} README.txt | xz -9 -T0 > ${JSON.stringify(archive)}`], {
      cwd: out,
      stdio: "inherit",
    });
    console.log(`${archive}  ${(fs.statSync(archive).size / 1e6).toFixed(1)} MB`);
  }
} else {
  fs.copyFileSync(bundle, path.join(out, "bot.js"));
  for (const file of ["README.txt", ".env"]) {
    const source = path.join(root, "dist-notes", `node-${file}`);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(out, file));
  }
  pack(out, path.join(root, "channel-digest-bot.zip"));
}

function pack(dir, zip) {
  // A data/ or .env left by a test run must never travel with the zip.
  for (const stray of ["data", "digest-store.json"]) {
    fs.rmSync(path.join(dir, stray), { recursive: true, force: true });
  }
  fs.rmSync(zip, { force: true });
  execFileSync("zip", ["-r", "-q", zip, "."], { cwd: dir, stdio: "inherit" });

  console.log(`\nbuild ${stamp}`);
  for (const file of fs.readdirSync(dir)) {
    console.log(`  ${file}  ${(fs.statSync(path.join(dir, file)).size / 1e6).toFixed(1)} MB`);
  }
  console.log(`\n${zip}  ${(fs.statSync(zip).size / 1e6).toFixed(1)} MB`);
}
