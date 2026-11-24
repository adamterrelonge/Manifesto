// Scheduled ingest — runs the full pipeline (lib/ingest-run.ts) outside
// Vercel, where a 5+ minute run isn't cut off by a function time limit.
//
//   npm run ingest
//
// Run daily by .github/workflows/ingest.yml. Prints a per-source summary and
// writes the full result to .cache/ingest-latest.json. Exits non-zero only
// when a whole pipeline stage failed or every source returned nothing, so a
// single broken scraper doesn't fail the job (it's listed instead).
//
// The site's cached query (lib/events-query.ts, revalidate: 60) picks up the
// new data within a minute; no revalidateTag call is needed from here.

import { mkdirSync, writeFileSync } from "node:fs";
import { runIngest } from "@/lib/ingest-run";

async function main() {
  const started = Date.now();
  const result = await runIngest();
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/ingest-latest.json", JSON.stringify(result, null, 2));

  let fetched = 0;
  let upserted = 0;
  const problems: string[] = [];
  for (const [name, source] of Object.entries(result.sources)) {
    fetched += source.fetched;
    upserted += source.upserted;
    if (source.fetched === 0 || source.errors.length > 0) {
      const detail = source.errors[0] ?? "0 events fetched";
      problems.push(`${name}: ${source.fetched} fetched, ${source.errors.length} errors — ${detail.slice(0, 160)}`);
    }
  }

  console.log(`ingest finished in ${secs}s: ${fetched} fetched, ${upserted} upserted`);
  const stages = {
    expiry: result.expiry,
    dedup: result.dedup,
    classify: result.classify,
    categoryInference: result.categoryInference,
    quality: result.quality,
    prune: result.prune,
    notify: result.notify,
  };
  const failedStages: string[] = [];
  for (const [name, stage] of Object.entries(stages)) {
    const summary = JSON.stringify(stage);
    console.log(`  ${name}: ${summary.slice(0, 200)}`);
    if (stage && typeof stage === "object" && "error" in stage) failedStages.push(name);
  }
  if (problems.length > 0) {
    console.log(`\n${problems.length} sources with problems:`);
    for (const p of problems) console.log(`  ${p}`);
  }

  if (failedStages.length > 0 || fetched === 0) {
    console.error(`\nFAILED: ${failedStages.length ? `stages ${failedStages.join(", ")}` : "no events fetched"}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
