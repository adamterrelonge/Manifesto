// Keyword miner — finds candidate phrases for lib/buckets.ts.
//
//   npm run mine:keywords            # all gate-qualifying buckets
//   npm run mine:keywords -- queer   # one bucket
//
// For each bucket, compares n-grams in events already tagged with it
// (moderator-approved, high-confidence keyword, or source mission) against
// events with no qualifying tag, and prints phrases that are far more
// common in the tagged set and appear across at least 2 different
// organisers. Read-only: it never writes to the DB or to lib/buckets.ts.
// Each candidate still needs a human judgement — a phrase that's common in
// Black-led events ("community", "workshop") is not evidence by itself.

import { classifyEventBuckets, isGateQualifyingBucket } from "@/lib/buckets";
import { buildBucketLabels, embeddingText, minePhrases } from "@/lib/semantic";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLabelledEvents, sourceKey } from "./_labelled-events";

const TOP_N = 25;

async function main() {
  const only = process.argv[2];
  const events = await loadLabelledEvents(createAdminClient());
  const labels = buildBucketLabels(events);
  const byId = new Map(events.map((e) => [e.id, e]));

  const anyQualifying = new Set<string>();
  for (const entry of labels.values()) for (const id of entry.tagged) anyQualifying.add(id);
  const background = events
    .filter((e) => !anyQualifying.has(e.id))
    .map((e) => embeddingText(e.title, e.description));

  console.log(`${events.length} live events, ${background.length} with no identity tag (background)\n`);

  for (const [slug, entry] of labels) {
    if (only && slug !== only) continue;
    const positives = [...entry.positives].map((id) => {
      const e = byId.get(id)!;
      return { text: embeddingText(e.title, e.description), source: sourceKey(e) };
    });
    if (positives.length < 5) {
      console.log(`## ${slug}: only ${positives.length} positives — skipped\n`);
      continue;
    }

    // Drop phrases the current rules already catch for this bucket.
    const mined = minePhrases(positives, background).filter((m) => {
      const already = classifyEventBuckets({ title: m.phrase, description: null, isFree: false });
      return !already.some((a) => a.bucketSlug === slug) && isGateQualifyingBucket(slug);
    });

    console.log(`## ${slug} — ${positives.length} positives`);
    console.log("   log-odds  pos  bg  orgs  phrase");
    for (const m of mined.slice(0, TOP_N)) {
      console.log(
        `   ${m.logOdds.toFixed(2).padStart(8)}  ${String(m.positiveDocs).padStart(3)} ${String(m.backgroundDocs).padStart(3)}  ${String(m.distinctSources).padStart(4)}  ${m.phrase}`
      );
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
