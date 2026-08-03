#!/bin/bash
# Builds the Netlify deployment bundle.
#
# The zip's contents sit at the ROOT of the archive (no wrapper folder), so
# index.html is the site root whether you drop the .zip straight onto Netlify
# or unzip it first and drop the folder. A wrapper folder makes Netlify serve
# a directory listing at / and 404 the site.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

OUT="$REPO/build/math-studio"
ZIP="$REPO/build/math-studio-netlify.zip"

mkdir -p "$REPO/build"
rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT/netlify/functions"

cp -r "$REPO/public/studio/." "$OUT/"                       # the studio, at the root
cp "$REPO/netlify/functions/studio.mjs" "$OUT/netlify/functions/"
cp "$REPO/studio-prompts.json" "$OUT/netlify/functions/"    # the function reads this at runtime

# No [build] publish here on purpose: on a drag-and-drop deploy the folder you
# drop IS the publish directory, and setting publish can point Netlify at the
# wrong place. Only the function location and the API route are declared.
cat > "$OUT/netlify.toml" <<'TOML'
# Joseph's Math Studio
# Switch Claude on: Site settings -> Environment variables -> ANTHROPIC_API_KEY

[functions]
  directory = "netlify/functions"

[[redirects]]
  from = "/api/studio/*"
  to = "/.netlify/functions/studio/:splat"
  status = 200
TOML

# Belt and braces: _redirects works even if netlify.toml isn't picked up.
cat > "$OUT/_redirects" <<'REDIR'
/api/studio/*  /.netlify/functions/studio/:splat  200
REDIR

cp "$REPO/DEPLOY.txt" "$OUT/README.txt"

cd "$OUT"
zip -qr "$ZIP" .                                            # contents at the root
cd "$REPO"
echo "built $(basename "$ZIP")"
unzip -l "$ZIP" | sed -n '4,8p'
