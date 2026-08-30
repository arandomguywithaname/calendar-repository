#!/usr/bin/env node
/*
 * Guided one-command Fly.io deployment for the Apple Health connector.
 *
 *   npm run deploy
 *
 * Walks through everything after `fly auth login`: ensures the two secret
 * tokens exist (generating and saving them to .env if missing), gives the
 * project its own Fly app (never silently reusing one that might run
 * something else), sets the secrets, deploys, and prints the URLs to put
 * into Health Auto Export and claude.ai. Works in Windows Command Prompt,
 * PowerShell, and bash — anywhere Node runs.
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const FLY_TOML = path.join(ROOT, "fly.toml");
const DEFAULT_APP = "calendar-repository"; // the name fly.toml ships with

// One shell string (args are validated/generated, never free-form user text):
// resolves the fly shim/exe the same way in cmd and bash without DEP0190 noise.
function fly(args, opts = {}) {
  return spawnSync(["fly", ...args].join(" "), { cwd: ROOT, shell: true, encoding: "utf-8", ...opts });
}

function flyInteractive(args) {
  return spawnSync(["fly", ...args].join(" "), { cwd: ROOT, shell: true, stdio: "inherit" });
}

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      // Resolve before close(): close() emits 'close' synchronously, and the
      // EOF handler below must not win the race against a real answer.
      resolve(answer.trim());
      rl.close();
    });
    rl.on("close", () => resolve("")); // EOF behaves like accepting the default
  });
}

/** Minimal .env reader/updater that preserves unrelated lines. */
function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const values = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

function upsertEnv(key, value) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    if (text && !text.endsWith("\n")) text += "\n";
    text += line + "\n";
  }
  fs.writeFileSync(ENV_PATH, text);
}

function currentAppName() {
  const m = fs.readFileSync(FLY_TOML, "utf-8").match(/^app\s*=\s*['"]([^'"]+)['"]/m);
  return m ? m[1] : undefined;
}

function setAppName(name) {
  const text = fs.readFileSync(FLY_TOML, "utf-8");
  fs.writeFileSync(FLY_TOML, text.replace(/^app\s*=\s*['"][^'"]+['"]/m, `app = '${name}'`));
}

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

async function main() {
  console.log("Apple Health connector — Fly.io deploy\n");

  // 1. Fly CLI present and logged in?
  if (fly(["version"]).status !== 0) {
    die(
      "The Fly CLI isn't installed (or isn't on PATH yet — reopen the terminal after installing).\n" +
        '  Windows (run in PowerShell once): iwr https://fly.io/install.ps1 -useb | iex\n' +
        "  macOS/Linux: curl -L https://fly.io/install.sh | sh\n" +
        "Then run `fly auth login` and re-run `npm run deploy`."
    );
  }
  if (fly(["auth", "whoami"]).status !== 0) {
    console.log("Not signed in to Fly yet — opening login…");
    if (flyInteractive(["auth", "login"]).status !== 0) die("Fly login failed. Run `fly auth login`, then retry.");
  }

  // 2. Tokens: reuse .env values, generate anything missing and save it back.
  const env = readEnv();
  let ingestToken = env.HEALTH_INGEST_TOKEN || env.ATHLYTIC_INGEST_TOKEN;
  let mcpToken = env.MCP_TOKEN;
  if (!ingestToken) {
    ingestToken = crypto.randomBytes(24).toString("hex");
    upsertEnv("HEALTH_INGEST_TOKEN", ingestToken);
    console.log("Generated HEALTH_INGEST_TOKEN and saved it to .env");
  }
  if (!mcpToken) {
    mcpToken = crypto.randomBytes(24).toString("hex");
    upsertEnv("MCP_TOKEN", mcpToken);
    console.log("Generated MCP_TOKEN and saved it to .env");
  }

  // 3. App: this project must have its own Fly app. Deploying into an app
  //    that runs another project would replace that project.
  let app = currentAppName();
  if (!app) die(`Couldn't find an app name in ${FLY_TOML}.`);

  if (app !== DEFAULT_APP) {
    const keep = await ask(
      `fly.toml points at the app '${app}'.\n` +
        `Deploy there? Only say yes if that app belongs to THIS project — deploying replaces whatever the app runs now. [Y/n] `
    );
    if (keep && !/^y(es)?$/i.test(keep)) app = null;
  } else {
    app = null; // never deploy to the placeholder name without asking
  }

  for (let attempt = 0; !app; attempt++) {
    if (attempt >= 5) die("Couldn't create a Fly app after several tries — create one with `fly apps create <name>`, put the name in fly.toml, and re-run.");
    const suggestion = `apple-health-${crypto.randomBytes(2).toString("hex")}`;
    const answer = (await ask(`Pick a name for the new Fly app (Enter for '${suggestion}'): `)) || suggestion;
    if (!NAME_RE.test(answer)) {
      console.log("Names must be lowercase letters, digits, and dashes.");
      continue;
    }
    const created = fly(["apps", "create", answer]);
    if (created.status === 0) {
      app = answer;
      setAppName(app);
      console.log(`Created app '${app}' and updated fly.toml.`);
    } else {
      console.log((created.stderr || created.stdout || "").trim());
      console.log("That name didn't work (probably taken) — try another.");
    }
  }

  // 4. Secrets, then deploy.
  console.log("\nSetting secrets…");
  const secrets = fly(["secrets", "set", "-a", app, `HEALTH_INGEST_TOKEN=${ingestToken}`, `MCP_TOKEN=${mcpToken}`]);
  // A brand-new app has no machines yet; "no change" also comes back non-zero on some versions.
  if (secrets.status !== 0 && !/unchanged|no change/i.test(`${secrets.stderr}${secrets.stdout}`)) {
    die(`fly secrets set failed:\n${(secrets.stderr || secrets.stdout || "").trim()}`);
  }

  // --ha=false: exactly one machine. Health data lives in a JSON file on the
  // machine's disk, so a second "high availability" machine would split the
  // data between two disks and make reads randomly see nothing.
  console.log("Deploying (Fly builds the app on its servers — no local Node build needed)…\n");
  if (flyInteractive(["deploy", "-a", app, "--ha=false"]).status !== 0) {
    die("fly deploy failed — the output above says why. Fix and re-run `npm run deploy`.");
  }

  const base = `https://${app}.fly.dev`;
  console.log(`
✓ Deployed!

  Phone link — the ONE setting for the Vital app (or the REST API URL in
  Health Auto Export; no headers needed):
      ${base}/ingest/${ingestToken}

  claude.ai → Settings → Connectors → Add custom connector (name: Vital):
      ${base}/mcp/${mcpToken}

  Status page (safe for any browser): ${base}/health

Reprint these anytime with \`npm run link\`. Try it out with \`npm run demo\`
(sends 35 days of sample data). The links contain your secrets — saved in
.env, shared only inside the family. 🔒 Never paste this output into any
chat, screenshot, or message (not even to Claude).
`);
}

main()
  .then(() => process.exit(0)) // don't linger on an open stdin
  .catch((err) => die(err && err.message ? err.message : String(err)));
