#!/usr/bin/env node
// `npm run demo` — sends the built-in 35-day sample to your server, so the
// whole pipeline can be seen working without a phone and without uploading
// anything by hand. Real data later overwrites these days automatically.
//
// Optional: `npm run demo -- --url=http://localhost:3000` targets another server.
const fs = require("fs");
const path = require("path");
const { ROOT, connection } = require("./config");

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--url="));
  const { base, ingestToken, missing } = connection({ urlOverride: urlArg?.slice(6) });
  if (missing.length) {
    console.error("Not ready yet — missing: " + missing.join("; "));
    process.exit(1);
  }

  const samplePath = path.join(ROOT, "examples", "health-auto-export-sample.json");
  const body = fs.readFileSync(samplePath);
  console.log(`Sending 35 days of demo data to ${base} …`);

  const res = await fetch(`${base}/ingest/${ingestToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok || reply.ok !== true) {
    console.error(`Failed (${res.status}): ${reply.error || "unexpected reply"}`);
    process.exit(1);
  }
  console.log(
    `Done! Stored ${reply.dataPoints} data points across ${reply.daysTouched} days ` +
      `(${reply.firstDate} → ${reply.lastDate}).\n` +
      `Look at ${base}/health — and ask Claude something like "how recovered am I today?"\n` +
      `(This is made-up demo data; real data for the same days simply replaces it.)`
  );
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
