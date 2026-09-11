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
const os = require("os");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const FLY_TOML = path.join(ROOT, "fly.toml");
const DEFAULT_APP = "calendar-repository"; // the name fly.toml ships with
const VOLUME_NAME = "health_data"; // must match [[mounts]] source in fly.toml

// The real executable is `flyctl`; the short `fly` name is a symlink the
// installer creates, and on Windows that step needs administrator rights. When
// the UAC prompt is declined the install still leaves a working flyctl.exe, so
// fall back to it rather than claiming Fly isn't installed.
let FLY_BIN = "fly";

// One shell string (args are validated/generated, never free-form user text):
// resolves the fly shim/exe the same way in cmd and bash without DEP0190 noise.
function fly(args, opts = {}) {
  return spawnSync([FLY_BIN, ...args].join(" "), { cwd: ROOT, shell: true, encoding: "utf-8", ...opts });
}

function flyInteractive(args) {
  return spawnSync([FLY_BIN, ...args].join(" "), { cwd: ROOT, shell: true, stdio: "inherit" });
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

/** Names of the Fly apps on this account. Best-effort: an empty list just
 *  means we fall through to creating one. */
function listApps() {
  const out = fly(["apps", "list", "--json"]);
  if (out.status !== 0) return [];
  try {
    return JSON.parse(out.stdout)
      .map((a) => a.Name || a.name)
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/** Which secrets an app already holds, by name. */
function listSecrets(app) {
  const out = fly(["secrets", "list", "-a", app, "--json"]);
  if (out.status !== 0) return null; // couldn't tell
  try {
    return JSON.parse(out.stdout)
      .map((x) => x.Name || x.name)
      .filter(Boolean);
  } catch {
    return null;
  }
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
  // A stray copy of these files directly in the home folder makes the whole
  // home folder the Docker build context — Desktop, AppData and Downloads all
  // uploaded to Fly on every deploy, which times out long before it finishes.
  // It also means `npm run deploy` typed in the wrong terminal quietly builds
  // the wrong thing. Neither is ever what someone meant.
  if (path.resolve(ROOT) === path.resolve(os.homedir())) {
    die(
      `This copy of the project sits directly in your home folder:\n  ${ROOT}\n\n` +
        "Deploying from here would upload your entire home folder — Desktop, Downloads,\n" +
        "AppData and all — to Fly's builder, which never finishes.\n\n" +
        "The project needs a folder of its own. If you already have one (e.g. ~/vital),\n" +
        "change into it and run `npm run deploy` there."
    );
  }

  if (fly(["version"]).status !== 0) {
    FLY_BIN = "flyctl";
    if (fly(["version"]).status !== 0) {
      die(
        "The Fly CLI isn't installed (or isn't on PATH yet — reopen the terminal after installing).\n" +
          '  Windows (run in PowerShell once): iwr https://fly.io/install.ps1 -useb | iex\n' +
          "  macOS/Linux: curl -L https://fly.io/install.sh | sh\n" +
          "If it IS installed, the folder is probably missing from PATH. On Windows:\n" +
          '  $env:PATH = "$HOME\\.fly\\bin;$env:PATH"\n' +
          "Then run `fly auth login` (or `flyctl auth login`) and re-run `npm run deploy`."
      );
    }
    console.log("Using `flyctl` — the short `fly` name is missing, which on Windows means the");
    console.log("installer's symlink step was declined at the admin prompt. Harmless.\n");
  }
  if (fly(["auth", "whoami"]).status !== 0) {
    console.log("Not signed in to Fly yet — opening login…");
    if (flyInteractive(["auth", "login"]).status !== 0) die("Fly login failed. Run `fly auth login`, then retry.");
  }

  // 2. Tokens: reuse .env values, generate anything missing and save it back.
  const env = readEnv();
  let ingestToken = env.HEALTH_INGEST_TOKEN || env.ATHLYTIC_INGEST_TOKEN;
  let mcpToken = env.MCP_TOKEN;
  const freshTokens = !ingestToken || !mcpToken;
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
    // fly.toml still carries the placeholder name. The real name is only ever
    // written to this file locally and is never committed, so a fresh clone
    // always lands here — including on a machine that already runs this
    // project. Creating a new app at this point is almost never what someone
    // wants: they end up with a second, empty server while their phone keeps
    // talking to the first one. So offer what already exists first.
    app = null;
    const existing = listApps();
    if (existing.length) {
      console.log("\nThis folder doesn't say which Fly app to deploy to yet.");
      console.log("Apps already on your account:\n");
      existing.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
      const pick = await ask(
        "\nDeploy to one of these? Type its number, or press Enter to create a NEW app: "
      );
      const index = Number(pick) - 1;
      if (pick.trim() && Number.isInteger(index) && index >= 0 && index < existing.length) {
        app = existing[index];
        setAppName(app);
        console.log(`Deploying to '${app}' and remembering it in fly.toml.`);
      }
    }
  }

  const appIsNew = !app;
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
  //
  // Both links people actually use — the one in the phone and the connector in
  // claude.ai — carry a token inside the URL. Pushing different tokens to an
  // app that already has them silently breaks both, with no error anywhere:
  // the phone just stops uploading. That happens whenever .env is missing, as
  // it is in any fresh clone, because tokens were then generated a moment ago.
  if (freshTokens && !appIsNew) {
    const held = listSecrets(app);
    const clashes = held === null || held.includes("HEALTH_INGEST_TOKEN") || held.includes("MCP_TOKEN");
    if (clashes) {
      console.log(`\n'${app}' already has its tokens set, but this folder had no .env,`);
      console.log("so brand-new ones were just generated. Deploying them would replace the");
      console.log("working tokens and break the link already saved on the phone and the");
      console.log("connector already added in claude.ai.\n");
      console.log("To keep the current links: stop here, copy .env from the folder you");
      console.log("deployed from before into this one, and run `npm run deploy` again.\n");
      const go = await ask("Or replace the tokens and re-share new links with everyone? [y/N] ");
      if (!/^y(es)?$/i.test((go || "").trim())) {
        die("Stopped before deploying. Nothing on Fly was changed.");
      }
    }
  }

  console.log("\nSetting secrets…");
  const secrets = fly(["secrets", "set", "-a", app, `HEALTH_INGEST_TOKEN=${ingestToken}`, `MCP_TOKEN=${mcpToken}`]);
  // A brand-new app has no machines yet; "no change" also comes back non-zero on some versions.
  if (secrets.status !== 0 && !/unchanged|no change/i.test(`${secrets.stderr}${secrets.stdout}`)) {
    die(`fly secrets set failed:\n${(secrets.stderr || secrets.stdout || "").trim()}`);
  }

  // 5. Persistent disk. fly.toml mounts a volume at DATA_DIR; without the
  //    volume existing the deploy fails, and without the mount every deploy
  //    would wipe the stored history. Create it once, keep it forever.
  const region = (fs.readFileSync(FLY_TOML, "utf-8").match(/primary_region\s*=\s*['"]([^'"]+)['"]/) || [])[1] || "ams";
  let haveVolume = false;
  const listed = fly(["volumes", "list", "-a", app, "--json"]);
  try {
    haveVolume = JSON.parse(listed.stdout || "[]").some((v) => v && v.name === VOLUME_NAME);
  } catch {
    haveVolume = new RegExp(`\\b${VOLUME_NAME}\\b`).test(listed.stdout || "");
  }
  if (haveVolume) {
    console.log(`Storage: volume '${VOLUME_NAME}' already exists — health data survives this deploy.`);
  } else {
    console.log(`\nCreating a 1 GB volume '${VOLUME_NAME}' in ${region} so health data survives redeploys…`);
    const made = fly(["volumes", "create", VOLUME_NAME, "-a", app, "-r", region, "-s", "1", "--yes"]);
    if (made.status !== 0) {
      die(
        `Couldn't create the volume:\n${(made.stderr || made.stdout || "").trim()}\n\n` +
          `Create it by hand and re-run: fly volumes create ${VOLUME_NAME} -a ${app} -r ${region} -s 1`
      );
    }
  }

  // --ha=false: exactly one machine. Health data lives in a JSON file on the
  // mounted volume, and a volume attaches to one machine — a second "high
  // availability" machine would get its own empty disk and serve nothing.
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
