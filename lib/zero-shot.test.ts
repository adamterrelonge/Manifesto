import { describe, it, expect } from "vitest";
import {
  AUTO_APPLY,
  MODEL_CONFIDENCE_MAX,
  MODEL_CONFIDENCE_MIN,
  decide,
  isVerifiedEvidence,
  maskOrganiser,
  modelConfidence,
  pickCategory,
  splitPassages,
  type AutoApplyRule,
  type ModelTarget,
  type PassageScore,
} from "@/lib/zero-shot";
import { AUTO_APPROVE_THRESHOLD, HIGH_CONFIDENCE_THRESHOLD } from "@/lib/buckets";

const event = {
  title: "Senior Community Cinema: Cactus Pears",
  description: "A closeted gay man returns to his hometown. Presented by Queer Film Club. Tickets £5.",
  organiserName: "Queer Film Club",
};

describe("splitPassages", () => {
  it("puts the title first and keeps the opening sentences", () => {
    const p = splitPassages(event.title, event.description, event.organiserName);
    expect(p[0].text).toBe(event.title);
    expect(p[1].text).toBe("A closeted gay man returns to his hometown.");
    expect(p.length).toBeLessThanOrEqual(4);
  });

  it("masks the organiser's name in what the model reads, but keeps the verbatim text", () => {
    const p = splitPassages(event.title, event.description, event.organiserName);
    const presented = p.find((x) => x.text.startsWith("Presented by"))!;
    expect(presented.text).toBe("Presented by Queer Film Club.");
    expect(presented.input).toBe("Presented by the organiser.");
  });

  it("drops duplicates and very short fragments", () => {
    const p = splitPassages("Trans Social", "Trans Social. Hi. A monthly social for trans people.", null);
    expect(p.map((x) => x.text)).toEqual(["Trans Social", "A monthly social for trans people."]);
  });
});

describe("maskOrganiser", () => {
  it("only replaces whole-word matches and leaves short names alone", () => {
    expect(maskOrganiser("Queer Britain presents", "Queer Britain")).toBe("the organiser presents");
    expect(maskOrganiser("Queer Britainnia", "Queer Britain")).toBe("Queer Britainnia");
    expect(maskOrganiser("ICA talk", "ICA")).toBe("ICA talk");
  });
});

describe("isVerifiedEvidence", () => {
  it("rejects text that isn't in the event", () => {
    expect(isVerifiedEvidence({ text: "A queer night", input: "A queer night" }, event)).toBe(false);
  });

  it("rejects a passage that is only the organiser's name", () => {
    const e = { title: "Queer Film Club", description: null, organiserName: "Queer Film Club" };
    expect(isVerifiedEvidence({ text: "Queer Film Club", input: "the organiser" }, e)).toBe(false);
  });

  it("accepts a verbatim passage with content of its own", () => {
    expect(isVerifiedEvidence({ text: "A closeted gay man returns to his hometown.", input: "" }, event)).toBe(true);
  });
});

describe("decide", () => {
  const passages = splitPassages(event.title, event.description, event.organiserName);
  const scores: PassageScore[] = passages.map((passage, i) => ({ passage, hypothesis: "for LGBTQ+ people", score: i === 1 ? 0.97 : 0.2 }));
  const rules = (over: Partial<AutoApplyRule>): Record<ModelTarget, AutoApplyRule> => ({
    ...AUTO_APPLY,
    queer: { enabled: true, threshold: 0.9, basis: "test", ...over },
  });

  it("applies an enabled target above threshold, with the best passage as evidence", () => {
    const d = decide("queer", scores, event, rules({}))!;
    expect(d.evidence.passage.text).toBe("A closeted gay man returns to his hometown.");
    expect(d.evidenceText).toContain('"A closeted gay man returns to his hometown."');
  });

  it("does nothing for a disabled target or below threshold", () => {
    expect(decide("queer", scores, event, rules({ enabled: false }))).toBeNull();
    expect(decide("queer", scores, event, rules({ threshold: 0.98 }))).toBeNull();
  });

  it("ignores a high score on unverifiable text", () => {
    const fake: PassageScore[] = [{ passage: { text: "Not in the event", input: "x" }, hypothesis: "h", score: 0.99 }];
    expect(decide("queer", fake, event, rules({}))).toBeNull();
  });

  it("keeps disabled-by-eval buckets off", () => {
    for (const t of ["black", "south-asian", "womxn-led", "sober-friendly", "community-culture"] as ModelTarget[]) {
      expect(AUTO_APPLY[t].enabled, t).toBe(false);
    }
  });
});

describe("modelConfidence", () => {
  it("stays public but below auto-approve, so moderators still see every model tag", () => {
    for (const score of [0.9, 0.95, 0.999, 1]) {
      const c = modelConfidence(score, 0.9);
      expect(c).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD);
      expect(c).toBeLessThan(AUTO_APPROVE_THRESHOLD);
    }
    expect(modelConfidence(0.9, 0.9)).toBe(MODEL_CONFIDENCE_MIN);
    expect(modelConfidence(1, 0.9)).toBe(MODEL_CONFIDENCE_MAX);
  });
});

describe("pickCategory", () => {
  it("needs a confident winner with a clear margin", () => {
    expect(pickCategory({ film: 0.95, music: 0.3 })).toBe("film");
    expect(pickCategory({ film: 0.95, music: 0.9 })).toBeNull();
    expect(pickCategory({ film: 0.6 })).toBeNull();
  });
});
