import { describe, it, expect } from "vitest";
import {
  BIO_LINK_MISSIONS,
  EVENTBRITE_ORGANISER_MISSIONS,
  PROVIDER_MISSIONS,
  eventbriteOrganiserId,
  sourceMissionMatches,
} from "@/lib/source-missions";
import { EVENTBRITE_ORGANISERS } from "@/lib/sources/eventbrite-organisers";
import { BIO_LINK_SEEDS } from "@/lib/sources/bio-link-seeds";
import { AUTO_APPROVE_THRESHOLD, HIGH_CONFIDENCE_THRESHOLD } from "@/lib/buckets";

describe("eventbriteOrganiserId", () => {
  it("reads the id from the URL lib/sources/eventbrite.ts writes", () => {
    expect(eventbriteOrganiserId("https://www.eventbrite.com/o/2849465606")).toBe("2849465606");
  });

  it("reads the id from a public slugged organiser URL", () => {
    expect(
      eventbriteOrganiserId("https://www.eventbrite.co.uk/o/black-history-walks-2849465606")
    ).toBe("2849465606");
  });

  it("returns null for a missing or non-organiser URL", () => {
    expect(eventbriteOrganiserId(null)).toBeNull();
    expect(eventbriteOrganiserId("https://example.org/about")).toBeNull();
  });
});

describe("sourceMissionMatches", () => {
  it("tags an Eventbrite organiser's event from its mission", () => {
    const matches = sourceMissionMatches({
      sourceProvider: "eventbrite",
      organiserSourceType: "eventbrite",
      organiserProfileUrl: "https://www.eventbrite.com/o/43436027623",
      organiserName: "Dope Black Queers",
    });
    expect(matches.map((m) => m.bucketSlug).sort()).toEqual(["black", "queer"]);
    expect(matches[0].evidence).toMatch(/^source mission — /);
  });

  it("tags nothing for a curated organiser deliberately left out", () => {
    // Instituto Cervantes — Spain, not Latinx.
    expect(
      sourceMissionMatches({
        sourceProvider: "eventbrite",
        organiserSourceType: "eventbrite",
        organiserProfileUrl: "https://www.eventbrite.com/o/10679852291",
      })
    ).toEqual([]);
  });

  it("tags a bio-link seed by handle", () => {
    const matches = sourceMissionMatches({
      sourceProvider: "bio-link",
      organiserSourceType: "bio-link",
      organiserName: "@eseacommunitycentre",
    });
    expect(matches.map((m) => m.bucketSlug)).toEqual(["east-mon-asian"]);
  });

  it("tags a single-organisation scraper by source provider", () => {
    const matches = sourceMissionMatches({ sourceProvider: "queer-britain" });
    expect(matches.map((m) => m.bucketSlug)).toEqual(["queer"]);
  });

  it("tags nothing for a general venue", () => {
    expect(sourceMissionMatches({ sourceProvider: "tate" })).toEqual([]);
  });
});

describe("mission tables", () => {
  const all = [
    ...Object.values(EVENTBRITE_ORGANISER_MISSIONS),
    ...Object.values(BIO_LINK_MISSIONS),
    ...Object.values(PROVIDER_MISSIONS),
  ];

  it("stay public-but-reviewable: >= gate threshold, < auto-approve", () => {
    for (const mission of all) {
      expect(mission.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD);
      expect(mission.confidence).toBeLessThan(AUTO_APPROVE_THRESHOLD);
      expect(mission.buckets.length).toBeGreaterThan(0);
      expect(mission.basis.length).toBeGreaterThan(0);
    }
  });

  it("only reference organisers that are actually in the curated seed lists", () => {
    const organiserIds = new Set(EVENTBRITE_ORGANISERS.map((o) => o.id));
    for (const id of Object.keys(EVENTBRITE_ORGANISER_MISSIONS)) {
      expect(organiserIds, `unknown Eventbrite organiser ${id}`).toContain(id);
    }
    const handles = new Set(BIO_LINK_SEEDS.map((s) => s.handle));
    for (const handle of Object.keys(BIO_LINK_MISSIONS)) {
      expect(handles, `unknown bio-link handle ${handle}`).toContain(handle);
    }
  });
});
