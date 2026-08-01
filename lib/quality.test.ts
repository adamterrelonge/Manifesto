import { describe, it, expect } from "vitest";
import { scoreEventQuality } from "@/lib/quality";

const GOOD_EVENT = {
  title: "Project a Black Planet: The Art and Culture of Panafrica",
  description:
    "Explore the impact of Pan-Africanism on artistic and cultural production from the 1920s to the present.",
  venueId: "venue-123",
  imageUrl: "https://example.com/image.jpg",
};

describe("scoreEventQuality", () => {
  it("scores a well-formed event at 1 with no flags", () => {
    const result = scoreEventQuality(GOOD_EVENT);
    expect(result.score).toBe(1);
    expect(result.flags).toEqual([]);
  });

  it("penalises a too-short title", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, title: "Gig" });
    expect(result.score).toBeLessThan(1);
    expect(result.flags).toContain("title too short");
  });

  it("penalises repeated characters in the title", () => {
    // Needs 5+ of the same character in a row (the pattern is /(.)\1{4,}/)
    // — 4 in a row isn't enough to trigger it.
    const result = scoreEventQuality({ ...GOOD_EVENT, title: "Big Soooooo Good Night" });
    expect(result.flags).toContain("repeated characters in title");
  });

  it("penalises excessive punctuation", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, title: "Amazing Night Out???" });
    expect(result.flags).toContain("excessive punctuation in title");
  });

  it("penalises all-caps titles", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, title: "AMAZING NIGHT OUT" });
    expect(result.flags).toContain("all-caps title");
  });

  it("does not flag a short all-caps acronym-style title as all-caps spam", () => {
    // "all-caps" only penalises titles longer than 8 chars — short branded
    // titles (e.g. an initialism) shouldn't be treated as shouty spam.
    const result = scoreEventQuality({ ...GOOD_EVENT, title: "BHM 2026" });
    expect(result.flags).not.toContain("all-caps title");
  });

  it("penalises a missing description", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, description: null });
    expect(result.flags).toContain("missing or very short description");
  });

  it("penalises a very short description", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, description: "Fun night." });
    expect(result.flags).toContain("missing or very short description");
  });

  it("penalises a missing matched venue", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, venueId: null });
    expect(result.flags).toContain("no matched venue");
  });

  it("penalises a missing image", () => {
    const result = scoreEventQuality({ ...GOOD_EVENT, imageUrl: null });
    expect(result.flags).toContain("no image");
  });

  it("clamps the score to 0 rather than going negative when every check fails", () => {
    // Stacks repeated-chars (-0.4) + excessive-punctuation (-0.2) +
    // all-caps (-0.15) + missing description (-0.15) + no venue (-0.2) +
    // no image (-0.05) = -1.15 against a starting score of 1, which must
    // clamp at 0 rather than go negative.
    const result = scoreEventQuality({
      title: "AMAZING NIGHTTTTT!!!",
      description: null,
      venueId: null,
      imageUrl: null,
    });
    expect(result.score).toBe(0);
  });
});
