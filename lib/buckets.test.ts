import { describe, it, expect } from "vitest";
import { classifyEventBuckets, isGateQualifyingBucket } from "@/lib/buckets";

describe("classifyEventBuckets", () => {
  it("matches nothing for generic text with no identity/accessibility signal", () => {
    const matches = classifyEventBuckets({
      title: "Tuesday Jazz Night",
      description: "A relaxed evening of live jazz in the courtyard bar.",
      isFree: false,
    });
    expect(matches).toEqual([]);
  });

  it("adds free-entry at confidence 1 when isFree is true, even with no other signal", () => {
    const matches = classifyEventBuckets({
      title: "Tuesday Jazz Night",
      description: null,
      isFree: true,
    });
    expect(matches).toEqual([
      { bucketSlug: "free-entry", confidence: 1, evidence: "is_free = true" },
    ]);
  });

  // Regression: "Pan-Africanism" didn't match the "pan-african" phrase
  // because the \b word-boundary regex requires a non-word character right
  // after "african", and "ism" continues the word — found via the real
  // Barbican "Project a Black Planet" exhibition copy.
  it("matches the black bucket in 'Pan-Africanism' text", () => {
    const matches = classifyEventBuckets({
      title: "Project a Black Planet: The Art and Culture of Panafrica",
      description: "Explore the impact of Pan-Africanism on artistic and cultural production.",
      isFree: false,
    });
    expect(matches.some((m) => m.bucketSlug === "black")).toBe(true);
  });

  // Regression: "Black audience viewings: Project a Black Planet" got zero
  // bucket matches — the keyword list had "black community"/"black-led"
  // etc. but not the "designated audience" session-naming pattern
  // institutions actually use.
  it("matches the black bucket for 'black audience' session naming", () => {
    const matches = classifyEventBuckets({
      title: "Black audience viewings: Project a Black Planet",
      description: null,
      isFree: false,
    });
    expect(matches.some((m) => m.bucketSlug === "black")).toBe(true);
  });

  it("matches poc/queer/latinx audience session naming", () => {
    expect(
      classifyEventBuckets({ title: "POC audience relaxed screening", description: null, isFree: false })
        .some((m) => m.bucketSlug === "poc")
    ).toBe(true);
    expect(
      classifyEventBuckets({ title: "Queer audience matinee", description: null, isFree: false }).some(
        (m) => m.bucketSlug === "queer"
      )
    ).toBe(true);
    expect(
      classifyEventBuckets({ title: "Latinx audience preview night", description: null, isFree: false }).some(
        (m) => m.bucketSlug === "latinx"
      )
    ).toBe(true);
  });

  it("never infers identity from context alone — no match without explicit phrasing", () => {
    // Deliberately styled like a Black-organiser event but with zero
    // explicit signal in the copy — must not match, per the project's
    // stated bias safeguard (lib/buckets.ts's own file comment).
    const matches = classifyEventBuckets({
      title: "Community Wellness Wednesday",
      description: "Join us for a relaxed evening of connection and support.",
      isFree: false,
    });
    expect(matches.some((m) => m.bucketSlug === "black")).toBe(false);
  });

  it("picks the highest-confidence phrase when multiple match the same bucket", () => {
    const matches = classifyEventBuckets({
      title: "Black-led Black History Month celebration",
      description: null,
      isFree: false,
    });
    const blackMatch = matches.find((m) => m.bucketSlug === "black");
    expect(blackMatch?.confidence).toBe(0.95); // "black-led", not "black history month" (0.85)
  });

  it("matches disability-friendly on explicit accessibility phrasing", () => {
    const matches = classifyEventBuckets({
      title: "Audio Described Tour",
      description: "BSL interpreted, step-free access throughout.",
      isFree: false,
    });
    expect(matches.some((m) => m.bucketSlug === "disability-friendly")).toBe(true);
  });

  // Regression: "bsl signed"/"deaf friendly" were misfiled under womxn-led,
  // so every BSL-signed performance was tagged womxn-led at 0.9 and passed
  // the gate on that false identity tag.
  // Regression: "\bdrag queen\b" didn't match "Drag Queens".
  it("matches plural forms of phrases", () => {
    const matches = classifyEventBuckets({
      title: "DISCO KARAOKE with Drag Queens",
      description: null,
      isFree: false,
    });
    expect(matches.some((m) => m.bucketSlug === "queer")).toBe(true);
  });

  it("tags 'BSL signed' as deaf-accessible, not womxn-led", () => {
    const matches = classifyEventBuckets({
      title: "Hamlet — BSL signed performance",
      description: null,
      isFree: false,
    });
    expect(matches.map((m) => m.bucketSlug)).toEqual(["deaf-accessible"]);
  });
});

describe("isGateQualifyingBucket", () => {
  it("rejects accessibility-only buckets — they must pair with a real identity bucket", () => {
    expect(isGateQualifyingBucket("disability-friendly")).toBe(false);
    expect(isGateQualifyingBucket("autistic-friendly")).toBe(false);
    expect(isGateQualifyingBucket("deaf-accessible")).toBe(false);
  });

  it("rejects cost-only buckets", () => {
    expect(isGateQualifyingBucket("free-entry")).toBe(false);
    expect(isGateQualifyingBucket("low-income-access")).toBe(false);
  });

  it("accepts real identity/community buckets", () => {
    expect(isGateQualifyingBucket("black")).toBe(true);
    expect(isGateQualifyingBucket("queer")).toBe(true);
    expect(isGateQualifyingBucket("womxn-led")).toBe(true);
  });
});
