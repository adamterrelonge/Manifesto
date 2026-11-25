// Local zero-shot NLI scorer for scripts/model-classify.ts. Runs the model
// named in lib/zero-shot.ts on CPU via transformers.js — no paid API.
// Scores are cached in .cache/ keyed by (model, passage, hypothesis), so a
// daily run only scores new or changed event text.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { CACHE_DIR, hash } from "./_embeddings";

type Classifier = Awaited<ReturnType<typeof pipeline<"zero-shot-classification">>>;

export class NliScorer {
  private classifier: Promise<Classifier> | null = null;
  private readonly cacheFile: string;
  private cache: Record<string, number>;
  private used = new Set<string>();
  computed = 0;
  cached = 0;

  constructor(private readonly model: string) {
    this.cacheFile = path.join(CACHE_DIR, `nli-${model.replace(/[^\w.-]+/g, "_")}.json`);
    this.cache = existsSync(this.cacheFile) ? JSON.parse(readFileSync(this.cacheFile, "utf8")) : {};
  }

  private getClassifier(): Promise<Classifier> {
    env.cacheDir = path.join(CACHE_DIR, "models");
    this.classifier ??= pipeline("zero-shot-classification", this.model, { dtype: "q8" });
    return this.classifier;
  }

  /** Entailment probability of each label (slotted into `template`) given
   *  `text`, each scored independently (multi-label), in the order given. */
  async score(text: string, hypotheses: string[], template: string): Promise<number[]> {
    const keyOf = (h: string) => hash(`${text}\u0000${template}\u0000${h}`);
    const keys = hypotheses.map(keyOf);
    const missing = hypotheses.filter((_, i) => !(keys[i] in this.cache));
    if (missing.length > 0) {
      const clf = await this.getClassifier();
      const out = (await clf(text, missing, { multi_label: true, hypothesis_template: template })) as {
        labels: string[];
        scores: number[];
      };
      out.labels.forEach((label, i) => {
        this.cache[keyOf(label)] = out.scores[i];
      });
      this.computed += missing.length;
    }
    this.cached += hypotheses.length - missing.length;
    keys.forEach((k) => this.used.add(k));
    return keys.map((k) => this.cache[k]);
  }

  /** Writes the cache, keeping only entries used this run so it doesn't
   *  grow with expired events. */
  save(): void {
    mkdirSync(CACHE_DIR, { recursive: true });
    const kept: Record<string, number> = {};
    for (const k of this.used) kept[k] = this.cache[k];
    writeFileSync(this.cacheFile, JSON.stringify(kept));
  }
}
