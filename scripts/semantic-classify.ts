// Free, local semantic classifier — suggests bucket tags for events the
// keyword rules and source missions missed, using a small sentence-embedding
// model run on CPU via transformers.js. No paid API.
//
//   npm run classify:semantic              # dry run: report + top candidates
//   npm run classify:semantic -- --write   # also insert suggestions
//
// Safety model:
//   - Suggestions are written as assigned_by 'embedding' with confidence
//     0.6-0.75, below the 0.8 public gate — they never make an event
//     public on their own; they wait in /admin/review.
//   - Existing (event, bucket) rows are never touched (insert-only), so
//     moderator decisions and keyword/mission tags always win.
//   - An event whose nearest labelled neighbour for a bucket is a
//     moderator-rejected example is not suggested for that bucket.
//   - At most MAX_PER_BUCKET suggestions per bucket per run, best first, so
//     the review queue stays workable.
//
// Not run inside the Vercel ingest route: the model (~35MB) and CPU
// inference don't fit a 60s serverless function. Run it locally or from a
// scheduled CI job after ingestion. Embeddings are cached in .cache/ keyed by
// a hash of the event text, so re-runs only embed new/changed events.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import type { BucketSlug } from "@/lib/buckets";
import {
  BUCKET_PROTOTYPES,
  MIN_CALIBRATION_POSITIVES,
  MIN_KNN_POSITIVES,
  QUERY_PREFIX,
  buildBucketLabels,
  bestPrototypeBucket,
  chooseThreshold,
  dedupeByTitle,
  embeddingText,
  knnScore,
  percentile,
  prototypeScore,
  suggestionConfidence,
} from "@/lib/semantic";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLabelledEvents } from "./_labelled-events";

const MODEL = "Xenova/bge-small-en-v1.5";
const CACHE_DIR = path.resolve(".cache");
const EMBED_CACHE = path.join(CACHE_DIR, "embeddings-bge-small-en-v1.5.json");
const BATCH_SIZE = 32;
const MAX_PER_BUCKET = 15;

type Cache = Record<string, { h: string; v: string }>; // v = base64 Float32Array

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}
function encode(vec: Float32Array): string {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength).toString("base64");
}
function decode(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;
let extractorPromise: Promise<Extractor> | null = null;
function getExtractor(): Promise<Extractor> {
  env.cacheDir = path.join(CACHE_DIR, "models");
  extractorPromise ??= pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return extractorPromise;
}

async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "cls", normalize: true });
  return (output.tolist() as number[][]).map((row) => Float32Array.from(row));
}

async function embedAll(items: { id: string; text: string }[]): Promise<Map<string, Float32Array>> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cache: Cache = existsSync(EMBED_CACHE) ? JSON.parse(readFileSync(EMBED_CACHE, "utf8")) : {};
  const vectors = new Map<string, Float32Array>();
  const todo: { id: string; text: string; h: string }[] = [];
  for (const item of items) {
    const h = hash(item.text);
    const hit = cache[item.id];
    if (hit && hit.h === h) vectors.set(item.id, decode(hit.v));
    else todo.push({ ...item, h });
  }
  console.log(`embeddings: ${vectors.size} cached, ${todo.length} to compute`);

  if (todo.length > 0) {
    const started = Date.now();
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const vecs = await embedTexts(batch.map((b) => b.text));
      batch.forEach((b, j) => {
        vectors.set(b.id, vecs[j]);
        cache[b.id] = { h: b.h, v: encode(vecs[j]) };
      });
      if (process.stdout.isTTY) {
        process.stdout.write(`\r  embedded ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
      }
    }
    process.stdout.write(`  (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
    // Drop cache entries for events no longer live.
    const live = new Set(items.map((i) => i.id));
    for (const id of Object.keys(cache)) if (!live.has(id)) delete cache[id];
    writeFileSync(EMBED_CACHE, JSON.stringify(cache));
  }
  return vectors;
}

interface Suggestion {
  eventId: string;
  bucketSlug: string;
  score: number;
  proto: number;
  confidence: number;
  evidence: string;
}

async function main() {
  const write = process.argv.includes("--write");
  const admin = createAdminClient();

  const events = await loadLabelledEvents(admin);
  const byId = new Map(events.map((e) => [e.id, e]));
  const vectors = await embedAll(events.map((e) => ({ id: e.id, text: embeddingText(e.title, e.description) })));
  const labels = buildBucketLabels(events);

  // Events with any identity tag are excluded from the background used for
  // calibration, so "unusual among untagged events" means what it says.
  const anyTagged = new Set<string>();
  for (const entry of labels.values()) for (const id of entry.tagged) anyTagged.add(id);
  const titleOf = (id: string) => byId.get(id)!.title;

  const protoVecsByBucket = new Map<string, Float32Array[]>();
  for (const [slug, protoTexts] of Object.entries(BUCKET_PROTOTYPES) as [BucketSlug, string[]][]) {
    protoVecsByBucket.set(slug, await embedTexts(protoTexts.map((t) => QUERY_PREFIX + t)));
  }
  const bestBucket = new Map(events.map((e) => [e.id, bestPrototypeBucket(vectors.get(e.id)!, protoVecsByBucket)]));

  const suggestions: Suggestion[] = [];
  console.log("\nbucket                 pos  neg  mode       threshold  bg-p99.5  pos-p25  suggested");
  for (const [slug] of Object.entries(BUCKET_PROTOTYPES) as [BucketSlug, string[]][]) {
    const entry = labels.get(slug) ?? { positives: new Set<string>(), negatives: new Set<string>(), tagged: new Set<string>() };
    const positives = dedupeByTitle(entry.positives, titleOf);
    if (positives.length < MIN_CALIBRATION_POSITIVES) {
      console.log(`${slug.padEnd(22)} ${String(positives.length).padStart(4)}  — fewer than ${MIN_CALIBRATION_POSITIVES} positives, can't calibrate, skipped`);
      continue;
    }

    const protoVecs = protoVecsByBucket.get(slug)!;
    const useKnn = positives.length >= MIN_KNN_POSITIVES;
    // selfId excludes an event from its own kNN pool (leave-one-out).
    const score = (id: string) => {
      const v = vectors.get(id)!;
      const proto = prototypeScore(v, protoVecs);
      if (!useKnn) return { score: proto, proto, knn: null };
      const knn = knnScore(v, positives, vectors, undefined, id);
      return { score: 0.5 * proto + 0.5 * knn.score, proto, knn };
    };

    // Calibrate on this run's data: known positives (leave-one-out) vs
    // events carrying no identity tag at all.
    const positiveScores = positives.map((id) => score(id).score);
    const backgroundScores = events.filter((e) => !anyTagged.has(e.id)).map((e) => score(e.id).score);
    const threshold = chooseThreshold(positiveScores, backgroundScores);

    const passing = events
      .filter((e) => !entry.tagged.has(e.id) && bestBucket.get(e.id) === slug)
      .map((e) => {
        const s = score(e.id);
        const neg = knnScore(vectors.get(e.id)!, entry.negatives, vectors, 1);
        return { e, ...s, neg };
      })
      // Veto: closer to a moderator-rejected example than to any positive.
      .filter((s) => s.score >= threshold && !(s.neg.nearestId && s.knn && s.neg.nearestSim >= s.knn.nearestSim))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PER_BUCKET);
    const maxScore = passing[0]?.score ?? threshold;

    for (const s of passing) {
      const nearest = s.knn?.nearestId ? `; nearest tagged: "${titleOf(s.knn.nearestId).slice(0, 70)}"` : "";
      suggestions.push({
        eventId: s.e.id,
        bucketSlug: slug,
        score: s.score,
        proto: s.proto,
        confidence: suggestionConfidence(s.score, threshold, maxScore),
        evidence: `embedding ${useKnn ? "prototype+kNN" : "prototype"} ${s.score.toFixed(3)} (threshold ${threshold.toFixed(3)})${nearest}`,
      });
    }

    console.log(
      `${slug.padEnd(22)} ${String(positives.length).padStart(4)} ${String(entry.negatives.size).padStart(4)}  ${(useKnn ? "proto+kNN" : "proto").padEnd(9)} ${threshold.toFixed(3).padStart(9)}  ${percentile(backgroundScores, 99.5).toFixed(3).padStart(8)}  ${percentile(positiveScores, 25).toFixed(3).padStart(7)}  ${String(passing.length).padStart(9)}`
    );
  }

  console.log("\nTop suggestions per bucket (review these before trusting the thresholds):");
  for (const slug of new Set(suggestions.map((s) => s.bucketSlug))) {
    console.log(`\n## ${slug}`);
    for (const s of suggestions.filter((x) => x.bucketSlug === slug)) {
      const e = byId.get(s.eventId)!;
      console.log(`  ${s.score.toFixed(3)} proto=${s.proto.toFixed(3)}  [${e.sourceProvider}] ${e.title.slice(0, 85)}`);
    }
  }

  if (!write) {
    console.log(`\nDry run: ${suggestions.length} suggestions not written. Re-run with --write to insert them.`);
    return;
  }

  const { data: buckets, error: bucketsError } = await admin.from("buckets").select("id, slug");
  if (bucketsError) throw new Error(bucketsError.message);
  const bucketIdBySlug = new Map((buckets ?? []).map((b) => [b.slug as string, b.id as string]));
  const rows = suggestions
    .filter((s) => bucketIdBySlug.has(s.bucketSlug))
    .map((s) => ({
      event_id: s.eventId,
      bucket_id: bucketIdBySlug.get(s.bucketSlug)!,
      confidence: s.confidence,
      evidence: s.evidence,
      assigned_by: "embedding",
    }));
  // ignoreDuplicates: insert-only — never overwrite an existing tag or a
  // moderator's decision on the same (event, bucket) pair.
  const { error } = await admin
    .from("event_buckets")
    .upsert(rows, { onConflict: "event_id,bucket_id", ignoreDuplicates: true });
  if (error) throw new Error(`insert failed: ${error.message}`);
  console.log(`\nWrote ${rows.length} suggestions to the review queue (assigned_by 'embedding').`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
