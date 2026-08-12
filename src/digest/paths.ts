import * as path from "path";

/**
 * Where the bot keeps its files.
 *
 * This has to answer correctly in two quite different situations. Run from the
 * source tree, the working directory is the project and that is where `data/`
 * belongs. Run as a compiled single-file binary — which is how it ships to
 * anyone without Node — the working directory is wherever the user happened to
 * be, or `/` if they double-clicked it, so the executable's own folder is the
 * only stable answer.
 *
 * The two are told apart by what is actually executing: a runtime named `node`
 * or `bun` means a script is being interpreted, anything else means the binary
 * is itself the program.
 */
export function appDir(): string {
  const runtime = path.basename(process.execPath).toLowerCase();
  const interpreted = /^(node|bun|node\.exe|bun\.exe)$/.test(runtime);
  return interpreted ? process.cwd() : path.dirname(process.execPath);
}

export function envPath(): string {
  return path.join(appDir(), ".env");
}

export function dataDir(): string {
  return process.env.DIGEST_DATA_DIR || path.join(appDir(), "data");
}
