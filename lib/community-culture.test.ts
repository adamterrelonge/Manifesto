import { describe, it, expect } from "vitest";
import { communityCultureFormatMatch, communityCultureSourceMatch } from "@/lib/community-culture";

const tagged = (title: string, description: string | null = null) =>
  communityCultureFormatMatch(title, description) !== null;

describe("communityCultureFormatMatch — Lates", () => {
  it("matches museum and gallery Lates seen in live data", () => {
    for (const title of [
      "LATE at Kettle's Yard",
      "Soane Late: A Georgian Christmas",
      "Soane Late x New Architecture Writers: House Speculations",
      "GoMA Late: Human Rights Day",
      "Wellcome Collection Lates: Not Done Yet",
      "Holburne Up Late: November",
      "Museum Late: Big Burns Ceilidh",
      "Tate Modern Late",
    ]) {
      expect(tagged(title), title).toBe(true);
    }
  });

  it("ignores bar crawls, art periods and ordinary words containing 'late'", () => {
    for (const title of [
      "Edinburgh Late Bar Crawl | 10pm Start, Shots & Drinks Deals",
      "Late Medieval (in-person)",
      "Pilates in EVERY THING MUST GO with Graft Pilates",
      "The Slates @ Hairy Dog Derby",
      "Chocolate Making Workshop",
      "Late Night Comedy Special",
    ]) {
      expect(tagged(title), title).toBe(false);
    }
  });

  it("gives Lates higher confidence than other formats", () => {
    expect(communityCultureFormatMatch("Tate Late", null)?.confidence).toBe(0.9);
    expect(communityCultureFormatMatch("Artist Talk: Jane Doe", null)?.confidence).toBe(0.85);
  });
});

describe("communityCultureFormatMatch — formats", () => {
  it("matches small-scale formats in the title", () => {
    for (const title of ["Artist Talk: Jane Doe", "In Conversation: Roman Impact", "Zine Fair", "Open Studios weekend", "Community Screening: Rye Lane", "Poetry Night", "Life Drawing"]) {
      expect(tagged(title), title).toBe(true);
    }
  });

  it("only trusts unambiguous phrases in descriptions", () => {
    expect(tagged("Untitled", "Works in conversation with the collection.")).toBe(false);
    expect(tagged("Untitled", "Join us for the book launch of her debut.")).toBe(true);
    expect(tagged("Friday", "Part of our museum late programme.")).toBe(true);
  });
});

describe("communityCultureSourceMatch", () => {
  it("matches curated community-anchored providers", () => {
    expect(communityCultureSourceMatch({ sourceProvider: "gasworks" })?.bucketSlug).toBe("community-culture");
    expect(communityCultureSourceMatch({ sourceProvider: "bio-link" })).not.toBeNull();
  });

  it("leaves big institutions to the format rule", () => {
    for (const sourceProvider of ["tate", "barbican", "vam-south-kensington", "national-gallery", "skiddle", "eventbrite"]) {
      expect(communityCultureSourceMatch({ sourceProvider }), sourceProvider).toBeNull();
    }
  });

  it("matches curated Eventbrite organisers by profile URL id", () => {
    const lookup = (id: string) => ({
      sourceProvider: "eventbrite",
      organiserSourceType: "eventbrite",
      organiserProfileUrl: `https://www.eventbrite.com/o/${id}`,
    });
    expect(communityCultureSourceMatch(lookup("10830367574"))).not.toBeNull(); // Feminist Library
    expect(communityCultureSourceMatch(lookup("18130540563"))).toBeNull(); // Battersea Power Station
  });
});
