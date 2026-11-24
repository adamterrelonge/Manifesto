import { describe, it, expect } from "vitest";
import {
  EMBEDDING_CONFIDENCE_MAX,
  EMBEDDING_CONFIDENCE_MIN,
  bestPrototypeBucket,
  buildBucketLabels,
  chooseThreshold,
  dedupeByTitle,
  knnScore,
  minePhrases,
  ngrams,
  percentile,
  suggestionConfidence,
  type LabelSourceEvent,
} from "@/lib/semantic";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/buckets";

const event = (over: Partial<LabelSourceEvent> & { id: string }): LabelSourceEvent => ({
  title: "Untitled",
  description: null,
  isFree: false,
  sourceProvider: "test",
  tags: [],
  ...over,
});

describe("buildBucketLabels", () => {
  it("uses text-evidenced keyword matches as positives", () => {
    const labels = buildBucketLabels([event({ id: "a", title: "Black History Month walk" })]);
    expect(labels.get("black")?.positives.has("a")).toBe(true);
  });

  it("marks source-mission events as tagged but NOT as positives", () => {
    // Mission tags describe the organiser, not the text — using them as
    // kNN positives taught "children's art club" as a `poc` signal.
    const labels = buildBucketLabels([event({ id: "a", title: "Saturday Art Club", sourceProvider: "new-art-exchange" })]);
    expect(labels.get("poc")?.tagged.has("a")).toBe(true);
    expect(labels.get("poc")?.positives.has("a")).toBe(false);
  });

  it("ignores stored source-mission/embedding rows as positives, but trusts moderator approvals", () => {
    const labels = buildBucketLabels([
      event({ id: "m", tags: [{ bucketSlug: "queer", confidence: 0.9, assignedBy: "source-mission" }] }),
      event({ id: "e", tags: [{ bucketSlug: "queer", confidence: 0.7, assignedBy: "embedding" }] }),
      event({ id: "h", tags: [{ bucketSlug: "queer", confidence: 0.7, assignedBy: "moderator" }] }),
    ]);
    const queer = labels.get("queer")!;
    expect([...queer.positives]).toEqual(["h"]);
    expect([...queer.tagged].sort()).toEqual(["e", "h", "m"]);
  });

  it("lets a moderator rejection override a keyword positive", () => {
    const labels = buildBucketLabels([
      event({
        id: "a",
        title: "Black History Month walk",
        tags: [{ bucketSlug: "black", confidence: 0.85, assignedBy: "rejected" }],
      }),
    ]);
    expect(labels.get("black")?.positives.has("a")).toBe(false);
    expect(labels.get("black")?.negatives.has("a")).toBe(true);
  });

  it("skips non-gate buckets entirely", () => {
    const labels = buildBucketLabels([event({ id: "a", title: "Free BSL interpreted tour", isFree: true })]);
    expect(labels.has("free-entry")).toBe(false);
    expect(labels.has("deaf-accessible")).toBe(false);
  });
});

describe("knnScore", () => {
  const vectors = new Map<string, number[]>([
    ["a", [1, 0]],
    ["b", [0.8, 0.6]],
    ["c", [0, 1]],
  ]);

  it("averages the top-k similarities and reports the nearest", () => {
    const r = knnScore([1, 0], ["a", "b", "c"], vectors, 2);
    expect(r.nearestId).toBe("a");
    expect(r.score).toBeCloseTo((1 + 0.8) / 2);
  });

  it("excludes selfId (leave-one-out)", () => {
    expect(knnScore([1, 0], ["a", "b"], vectors, 1, "a").nearestId).toBe("b");
  });

  it("returns zero for an empty pool", () => {
    expect(knnScore([1, 0], [], vectors)).toEqual({ score: 0, nearestId: null, nearestSim: 0 });
  });
});

describe("bestPrototypeBucket", () => {
  it("picks the bucket with the closest prototype", () => {
    const protos = new Map([
      ["black", [[1, 0]]],
      ["queer", [[0, 1]]],
    ]);
    expect(bestPrototypeBucket([0.2, 0.9], protos)).toBe("queer");
  });
});

describe("thresholds and confidence", () => {
  it("percentile picks the nearest-rank value", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });

  it("threshold is the stricter of background p99.5 and positive p25", () => {
    const background = Array.from({ length: 1000 }, (_, i) => i / 1000);
    expect(chooseThreshold([0.1, 0.2, 0.3, 0.4], background)).toBeCloseTo(0.994);
    expect(chooseThreshold([0.999, 1, 1, 1], background)).toBe(0.999);
  });

  it("confidence always stays inside the review-only band, below the public gate", () => {
    for (const score of [0.5, 0.7, 0.8, 0.99]) {
      const c = suggestionConfidence(score, 0.7, 0.8);
      expect(c).toBeGreaterThanOrEqual(EMBEDDING_CONFIDENCE_MIN);
      expect(c).toBeLessThanOrEqual(EMBEDDING_CONFIDENCE_MAX);
      expect(c).toBeLessThan(HIGH_CONFIDENCE_THRESHOLD);
    }
  });
});

describe("dedupeByTitle", () => {
  it("keeps one id per normalised title", () => {
    const titles: Record<string, string> = { a: "Trans Social", b: "trans  social ", c: "Other" };
    expect(dedupeByTitle(["a", "b", "c"], (id) => titles[id])).toEqual(["a", "c"]);
  });
});

describe("keyword mining", () => {
  it("ngrams skip stopword edges and single letters", () => {
    const grams = ngrams("A night of Black joy and the music");
    expect(grams.has("black joy")).toBe(true);
    expect(grams.has("of black")).toBe(false);
    expect(grams.has("joy and the")).toBe(false);
  });

  it("ranks phrases concentrated in positives across several organisers", () => {
    const positives = [
      { text: "african caribbean supper club", source: "x" },
      { text: "african caribbean film night", source: "y" },
      { text: "african caribbean history walk", source: "z" },
      { text: "jazz night", source: "x" },
    ];
    const background = ["jazz night", "jazz night", "film night", "history walk"];
    const mined = minePhrases(positives, background);
    // "african", "caribbean" and "african caribbean" tie on these counts.
    const top = mined.filter((m) => m.logOdds === mined[0].logOdds).map((m) => m.phrase);
    expect(top).toContain("african caribbean");
    expect(mined.find((m) => m.phrase === "night")).toBeUndefined(); // in background too, single org
  });

  it("drops phrases that only one organiser uses (boilerplate)", () => {
    const positives = [1, 2, 3].map(() => ({ text: "follow us on instagram", source: "same-org" }));
    expect(minePhrases(positives, ["something else"])).toEqual([]);
  });
});
