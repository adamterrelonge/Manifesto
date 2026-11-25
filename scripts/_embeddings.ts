// Shared sentence-embedding helpers for the offline classifier scripts
// (semantic-classify.ts, model-classify.ts). Runs Xenova/bge-small-en-v1.5
// on CPU via transformers.js; vectors are cached in .cache/ keyed by a hash
// of the event text, so re-runs only embed new or changed events.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const MODEL = "Xenova/bge-small-en-v1.5";
export const CACHE_DIR = path.resolve(".cache");
const EMBED_CACHE = path.join(CACHE_DIR, "embeddings-bge-small-en-v1.5.json");
const BATCH_SIZE = 32;

type Cache = Record<string, { h: string; v: string }>; // v = base64 Float32Array

export function hash(text: string): string {
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

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "cls", normalize: true });
  return (output.tolist() as number[][]).map((row) => Float32Array.from(row));
}

export async function embedAll(items: { id: string; text: string }[]): Promise<Map<string, Float32Array>> {
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
