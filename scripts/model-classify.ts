// Local zero-shot classifier (docs/INGESTION_EXPANSION_PLAN.md Phase 3).
// Free, CPU-only, via transformers.js — no paid API.
//
//   npm run classify:model                    # dry run: what would be written
//   npm run classify:model -- --write         # write enabled tags + categories
//   npm run classify:model -- --dump f.tsv    # candidates for hand-labelling
//   npm run classify:model -- --eval          # precision per target vs
//                                             # docs/eval/model-labels.json
//
// What it writes (only with --write):
//   - Bucket tags for targets switched on in lib/zero-shot.ts AUTO_APPLY,
//     as assigned_by 'model-evidence' with confidence 0.8-0.9: public, and
//     still in /admin/review for a moderator to confirm. Each carries the
//     verbatim passage that triggered it.
//   - `category` for events the keyword inference left null (never touches
//     a set category; doesn't affect the public gate).
// Safety:
//   - Never written for large-scale events (lib/scale.ts).
//   - Never overwrites a keyword, mission, organiser, moderator or rejected
//     row; it may upgrade a pending 'embedding' suggestion that it can back
//     with evidence from the event's own text.
//   - The organiser's name is masked before the model reads anything.
//
// Cost: candidates are pre-screened with the cached bge-small embeddings,
// and NLI scores are cached per passage, so a daily run only scores new text.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Category } from "@/lib/categories";
import { QUERY_PREFIX, embeddingText, prototypeScore } from "@/lib/semantic";
import {
  AUTO_APPLY,
  CATEGORY_AUTO_APPLY,
  CATEGORY_HYPOTHESES,
  HYPOTHESES,
  HYPOTHESIS_TEMPLATE,
  SCREEN_PROTOTYPES,
  ZERO_SHOT_MODEL,
  bestPassage,
  decide,
  pickCategory,
  splitPassages,
  type ModelTarget,
  type PassageScore,
} from "@/lib/zero-shot";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLabelledEvents, type LoadedEvent } from "./_labelled-events";
import { embedAll, embedTexts } from "./_embeddings";
import { NliScorer } from "./_nli";

/** How many of the closest untagged events per target the NLI model reads. */
const SCREEN_TOP_K: Record<ModelTarget, number> = {
  black: 60,
  poc: 60,
  queer: 60,
  latinx: 40,
  "east-mon-asian": 60,
  "south-asian": 60,
  "womxn-led": 60,
  "sober-friendly": 30,
  "grassroots-activism": 40,
  "community-culture": 150,
};
/** Known positives per target scored in --eval, to estimate recall. */
const EVAL_POSITIVES = 40;
const LABELS_FILE = path.resolve("docs/eval/model-labels.json");
/** Assigners the model may replace: pending suggestions only. */
const REPLACEABLE = new Set(["embedding"]);

type Labels = Partial<Record<ModelTarget, Record<string, boolean>>>;

export function labelKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

interface Scored {
  event: LoadedEvent;
  target: ModelTarget;
  best: PassageScore | null;
  scores: PassageScore[];
}

async function scoreEvent(nli: NliScorer, event: LoadedEvent, target: ModelTarget): Promise<Scored> {
  const hypotheses = HYPOTHESES[target];
  const scores: PassageScore[] = [];
  for (const passage of splitPassages(event.title, event.description, event.organiserName)) {
    const s = await nli.score(passage.input, hypotheses, HYPOTHESIS_TEMPLATE);
    hypotheses.forEach((hypothesis, i) => scores.push({ passage, hypothesis, score: s[i] }));
  }
  return { event, target, scores, best: bestPassage(scores, event) };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const evalMode = args.includes("--eval");
  const dumpIdx = args.indexOf("--dump");
  const dumpFile = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
  const started = Date.now();

  const admin = createAdminClient();
  const events = await loadLabelledEvents(admin);
  const vectors = await embedAll(events.map((e) => ({ id: e.id, text: embeddingText(e.title, e.description) })));
  const nli = new NliScorer(ZERO_SHOT_MODEL);
  const targets = Object.keys(HYPOTHESES) as ModelTarget[];

  const scored: Scored[] = [];
  const positivesScored: Scored[] = [];
  // Normal runs only spend CPU on targets that can actually be written.
  const runTargets = evalMode || dumpFile ? targets : targets.filter((t) => AUTO_APPLY[t].enabled);
  for (const target of runTargets) {
    const blocked =(e: LoadedEvent) =>
      e.tags.some((t) => t.bucketSlug === target && !REPLACEABLE.has(t.assignedBy));
    const protos = await embedTexts(SCREEN_PROTOTYPES[target].map((t) => QUERY_PREFIX + t));
    const candidates = events
      .filter((e) => e.scale !== "large" && !blocked(e))
      .map((e) => ({ e, sim: prototypeScore(vectors.get(e.id)!, protos) }))
      .sort((a, b) => b.sim - a.sim)
      // --eval reads 3x deeper, so precision is measured on harder
      // negatives than a normal run will ever see.
      .slice(0, SCREEN_TOP_K[target] * (evalMode ? 3 : 1));
    for (const { e } of candidates) scored.push(await scoreEvent(nli, e, target));

    if (evalMode) {
      // Recall proxy: events already tagged from their own text (keyword
      // ≥ 0.85) or approved by a moderator.
      const known = events
        .filter((e) =>
          e.tags.some(
            (t) =>
              t.bucketSlug === target &&
              (t.assignedBy === "moderator" || (t.assignedBy === "keyword" && (t.confidence ?? 0) >= 0.85))
          )
        )
        .slice(0, EVAL_POSITIVES);
      for (const e of known) positivesScored.push(await scoreEvent(nli, e, target));
    }
  }

  // Category backfill for events the keyword rules left uncategorised.
  const categoryUpdates: { id: string; category: Category; title: string }[] = [];
  const categoryHyps = Object.entries(CATEGORY_HYPOTHESES) as [Category, string][];
  const runCategories = CATEGORY_AUTO_APPLY || evalMode || dumpFile !== null;
  for (const event of runCategories ? events.filter((e) => !e.category) : []) {
    // Title only: it names the format; descriptions add cost, not signal.
    const [title] = splitPassages(event.title, null, event.organiserName);
    const best: Partial<Record<Category, number>> = {};
    const s = await nli.score(title.input, categoryHyps.map(([, h]) => h), HYPOTHESIS_TEMPLATE);
    categoryHyps.forEach(([cat], i) => (best[cat] = s[i]));
    const category = pickCategory(best);
    if (category) categoryUpdates.push({ id: event.id, category, title: event.title });
  }
  nli.save();
  console.log(
    `NLI: ${nli.computed} pairs scored, ${nli.cached} from cache (${((Date.now() - started) / 1000).toFixed(0)}s)`
  );

  if (dumpFile) {
    const lines = ["target\tscore\ttitle\tevidence\tlabel"];
    for (const s of scored.filter((x) => x.best && x.best.score >= 0.5).sort((a, b) => a.target.localeCompare(b.target) || b.best!.score - a.best!.score)) {
      lines.push([s.target, s.best!.score.toFixed(3), s.event.title, s.best!.passage.text.slice(0, 200), ""].join("\t"));
    }
    writeFileSync(dumpFile, lines.join("\n"));
    writeFileSync(`${dumpFile}.categories.tsv`, categoryUpdates.map((u) => `${u.category}\t${u.title}`).join("\n"));
    console.log(`Wrote ${lines.length - 1} candidates to ${dumpFile} (+ .categories.tsv)`);
  }

  if (evalMode) report(scored, positivesScored);

  const decisions = scored
    .map((s) => ({ s, d: decide(s.target, s.scores, s.event) }))
    .filter((x): x is { s: Scored; d: NonNullable<typeof x.d> } => x.d !== null);

  console.log("\ntarget                 enabled  threshold  candidates  applied");
  for (const target of targets) {
    const rule = AUTO_APPLY[target];
    console.log(
      `${target.padEnd(22)} ${String(rule.enabled).padEnd(8)} ${rule.threshold.toFixed(2).padStart(9)}  ${String(scored.filter((s) => s.target === target).length).padStart(10)}  ${String(decisions.filter((x) => x.d.target === target).length).padStart(7)}`
    );
  }
  for (const { s, d } of decisions.slice(0, 60)) {
    console.log(`  ${d.target.padEnd(20)} ${d.score.toFixed(3)}  ${s.event.title.slice(0, 70)}  ← "${d.evidence.passage.text.slice(0, 60)}"`);
  }
  console.log(`categories: ${categoryUpdates.length} of ${events.filter((e) => !e.category).length} uncategorised events`);

  if (!write) {
    console.log("\nDry run: nothing written. Re-run with --write.");
    return;
  }

  const { data: buckets, error: bucketsError } = await admin.from("buckets").select("id, slug");
  if (bucketsError) throw new Error(bucketsError.message);
  const bucketIdBySlug = new Map((buckets ?? []).map((b) => [b.slug as string, b.id as string]));
  const rows = decisions
    .filter(({ d }) => bucketIdBySlug.has(d.target))
    .map(({ s, d }) => ({
      event_id: s.event.id,
      bucket_id: bucketIdBySlug.get(d.target)!,
      confidence: d.confidence,
      evidence: d.evidenceText,
      assigned_by: "model-evidence",
    }));
  if (rows.length > 0) {
    // Candidates already exclude every non-replaceable row, so this upsert
    // only inserts new pairs or upgrades pending 'embedding' suggestions.
    const { error } = await admin.from("event_buckets").upsert(rows, { onConflict: "event_id,bucket_id" });
    if (error) throw new Error(`bucket write failed: ${error.message}`);
  }

  let categoryErrors = 0;
  for (const u of CATEGORY_AUTO_APPLY ? categoryUpdates : []) {
    const { error } = await admin.from("events").update({ category: u.category }).eq("id", u.id).is("category", null);
    if (error) categoryErrors += 1;
  }
  const categoriesWritten = CATEGORY_AUTO_APPLY ? categoryUpdates.length - categoryErrors : 0;
  console.log(`\nWrote ${rows.length} model-evidence tags and ${categoriesWritten} categories (${categoryErrors} errors).`);
}

function report(scored: Scored[], positives: Scored[]) {
  const labels: Labels = existsSync(LABELS_FILE) ? JSON.parse(readFileSync(LABELS_FILE, "utf8")) : {};
  const thresholds = [0.8, 0.9, 0.95, 0.98, 0.99];
  console.log("\n=== Eval (precision on hand labels; recall on known positives) ===");
  console.log("target                 thr   above  labelled  precision  unlabelled  recall");
  const targets = [...new Set(scored.map((s) => s.target))];
  // One row per distinct title: a weekly listing shouldn't count 12 times.
  const distinct = (rows: Scored[]) => {
    const seen = new Set<string>();
    return rows.filter((s) => !seen.has(labelKey(s.event.title)) && seen.add(labelKey(s.event.title)));
  };
  for (const target of targets) {
    const mine = distinct(scored.filter((s) => s.target === target && s.best));
    const pos = distinct(positives.filter((s) => s.target === target && s.best));
    const targetLabels = labels[target] ?? {};
    for (const thr of thresholds) {
      const above = mine.filter((s) => s.best!.score >= thr);
      const labelled = above.filter((s) => labelKey(s.event.title) in targetLabels);
      const correct = labelled.filter((s) => targetLabels[labelKey(s.event.title)]);
      const precision = labelled.length ? `${((100 * correct.length) / labelled.length).toFixed(0)}%` : "—";
      const recall = pos.length ? `${pos.filter((s) => s.best!.score >= thr).length}/${pos.length}` : "—";
      console.log(
        `${target.padEnd(22)} ${thr.toFixed(2)} ${String(above.length).padStart(6)} ${String(labelled.length).padStart(9)} ${precision.padStart(10)} ${String(above.length - labelled.length).padStart(11)}  ${recall}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
