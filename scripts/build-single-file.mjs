/**
 * Builds build/math-studio.html — the entire studio as ONE file.
 *
 * Why: a folder with css/ and js/ subfolders is easy to break when publishing.
 * Drag-and-drop uploads routinely lose nested folders, and the result is a page
 * that loads but has no styling and no working buttons. A single file cannot be
 * half-uploaded, so this is the version to hand to anyone publishing by hand.
 *
 * Run: node scripts/build-single-file.mjs
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(REPO, "public/studio");
const OUT = path.join(REPO, "build");

// esbuild inlines the dynamically imported editors and games into one script
const bundled = await build({
  entryPoints: [path.join(SRC, "js/app.js")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: false,
  write: false,
  logLevel: "warning",
});

const js = bundled.outputFiles[0].text;
const css = fs.readFileSync(path.join(SRC, "css/studio.css"), "utf-8");
const html = fs.readFileSync(path.join(SRC, "index.html"), "utf-8");

const single = html
  .replace('<link rel="stylesheet" href="./css/studio.css" />', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="./js/app.js"></script>',
    `<script>\n${js}\n</script>`
  );

if (single.includes("./css/studio.css") || single.includes("./js/app.js")) {
  throw new Error("something still points at an external file — the single-file build would be broken");
}

fs.mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, "math-studio.html");
fs.writeFileSync(dest, single);

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`built ${path.relative(REPO, dest)}  (${kb(single.length)}: ${kb(css.length)} css + ${kb(js.length)} js)`);
