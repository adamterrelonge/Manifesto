import { describe, it, expect } from "vitest";
import { isSpektrixEventCandidate, normaliseSpektrixEvent, type SpektrixRawEvent } from "./spektrix";
import { normaliseTribeEvent, type TribeRawEvent } from "./tribe-events";
import { SPEKTRIX_VENUES, TRIBE_SITES, sourceKey } from "./platform-venues";
import { COMMUNITY_ANCHORED_PROVIDERS } from "@/lib/community-culture";

const spx = (over: Partial<SpektrixRawEvent>): SpektrixRawEvent => ({
  id: "821203ATNKKTLSLHJMMNQGBSHMRMVKNCB",
  name: "Archive Tour – LGBTQIA+ Collections",
  firstInstanceDateTimeUtc: "2026-11-28T18:30:00Z",
  lastInstanceDateTimeUtc: "2026-11-28T18:30:00Z",
  ...over,
});

describe("isSpektrixEventCandidate", () => {
  it("keeps real events", () => {
    for (const name of ["Archive Tour – LGBTQIA+ Collections", "Kindrd Jam", "Dance in a Day - Lindy Hop", "Global Majority"]) {
      expect(isSpektrixEventCandidate(spx({ name })), name).toBe(true);
    }
  });

  it("drops add-ons, packages and courses sold as events", () => {
    for (const name of [
      "Audio Description Headset",
      "Captioning Facilities",
      "Touch Tour (Studio)",
      "Pre-order Drinks",
      "Sip and Snack Package",
      "KIDS BUNDLE DEALS",
      "Secure My Booking",
      "Babies In Arms Ticket (Afternoon)",
      "Pilates - Nov-Dec",
      "Exploring Watercolour 5 week course",
      "C&C 2026-27 Ballet Improvers",
      "***Captioning Service",
      "**Miss Bennet Programme",
      "Creative Communities Coworking",
    ]) {
      expect(isSpektrixEventCandidate(spx({ name })), name).toBe(false);
    }
  });
});

describe("normaliseSpektrixEvent", () => {
  const config = SPEKTRIX_VENUES.find((v) => v.provider === "bishopsgate-institute")!;

  it("uses the next performance as start and strips HTML from the description", () => {
    const e = normaliseSpektrixEvent(config, {
      event: spx({ htmlDescription: "<p>A tour of the <b>LGBTQIA+</b> archive.</p>", duration: 60 }),
      startAt: "2026-11-28T18:30:00.000Z",
    });
    expect(e.startAt).toBe("2026-11-28T18:30:00.000Z");
    expect(e.endAt).toBe("2026-11-28T19:30:00.000Z");
    expect(e.description).toBe("A tour of the LGBTQIA+ archive.");
    expect(e.source).toEqual({ provider: "bishopsgate-institute", id: "821203ATNKKTLSLHJMMNQGBSHMRMVKNCB", url: config.whatsOnUrl });
    expect(e.venue?.postcode).toBe("EC2M 4QH");
  });

  it("filters shared and online accounts by venue", () => {
    const hpph = SPEKTRIX_VENUES.find((v) => v.provider === "hyde-park-picture-house")!;
    expect(hpph.include!(spx({ attribute_Venue: "Leeds Grand Theatre" }))).toBe(false);
    expect(hpph.include!(spx({ attribute_Venue: "Hyde Park Picture House" }))).toBe(true);
    expect(config.include!(spx({ attribute_Location: "Online" }))).toBe(false);
  });
});

describe("normaliseTribeEvent", () => {
  const config = TRIBE_SITES.find((s) => s.provider === "chats-palace")!;
  const raw: TribeRawEvent = {
    id: 4242,
    url: "https://chatspalace.com/event/voicebox/",
    title: "Sonny E, Ruby Throat &#038; Lazy Jane",
    description: "<p>An evening of song.</p>",
    utc_start_date: "2026-11-26 19:30:00",
    utc_end_date: "2026-11-26 22:30:00",
    cost: "Free – £12.5",
    cost_details: { values: ["0", "12.5"] },
    venue: { venue: "Chats Palace Arts Centre" },
    image: { url: "https://chatspalace.com/img.jpg" },
  };

  it("decodes entities, reads UTC times and price range", () => {
    const e = normaliseTribeEvent(config, raw);
    expect(e.title).toBe("Sonny E, Ruby Throat & Lazy Jane");
    expect(e.startAt).toBe("2026-11-26T19:30:00.000Z");
    expect(e.endAt).toBe("2026-11-26T22:30:00.000Z");
    expect([e.priceMin, e.priceMax, e.isFree]).toEqual([0, 12.5, false]);
    expect(e.venue).toBe(config.venue);
    expect(e.source).toEqual({ provider: "chats-palace", id: "4242", url: raw.url });
  });

  it("uses an event's own venue when it differs, and reads plain 'Free'", () => {
    const e = normaliseTribeEvent(config, { ...raw, venue: { venue: "Hackney Library", city: "London", zip: "E8 1GQ" }, cost: "Free", cost_details: { values: [] } });
    expect(e.venue?.name).toBe("Hackney Library");
    expect(e.isFree).toBe(true);
  });

  it("falls back to the site venue when the API returns an empty venue", () => {
    expect(normaliseTribeEvent(config, { ...raw, venue: [] }).venue).toBe(config.venue);
  });
});

describe("platform venue config", () => {
  const all = [...SPEKTRIX_VENUES, ...TRIBE_SITES];

  it("has unique providers and health keys", () => {
    expect(new Set(all.map((v) => v.provider)).size).toBe(all.length);
    expect(new Set(all.map((v) => sourceKey(v.provider))).size).toBe(all.length);
    expect(sourceKey("hyde-park-picture-house")).toBe("hydeParkPictureHouse");
  });

  it("only allow-lists providers that exist", () => {
    for (const p of ["chats-palace", "housmans", "rich-mix", "theatre503", "wharf-chambers"]) {
      expect(all.some((v) => v.provider === p), p).toBe(true);
      expect(COMMUNITY_ANCHORED_PROVIDERS[p], p).toBeTruthy();
    }
    for (const p of ["broadway-nottingham", "hyde-park-picture-house", "derby-quad"]) {
      expect(COMMUNITY_ANCHORED_PROVIDERS[p], p).toBeUndefined();
    }
  });
});
