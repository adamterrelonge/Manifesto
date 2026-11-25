import { describe, it, expect } from "vitest";
import { assessScale, type ScaleInput } from "@/lib/scale";
import { passesPublicGate } from "@/lib/public-gate";

const input = (over: Partial<ScaleInput>): ScaleInput => ({
  title: "An event",
  description: null,
  sourceProvider: "skiddle",
  venueName: null,
  venueCapacity: null,
  priceMax: null,
  ...over,
});
const scaleOf = (over: Partial<ScaleInput>) => assessScale(input(over)).scale;

describe("assessScale", () => {
  it("marks venues known to hold 300+ as large (names from live data)", () => {
    for (const venueName of [
      "The O2",
      "O2 Academy Bristol",
      "O2 Academy2 Oxford",
      "Utilita Arena Cardiff",
      "OVO Hydro",
      "Eventim Apollo",
      "Phoenix Theatre",
      "His Majestys Theatre",
      "Apollo Victoria Theater",
      "Theatre Royal Drury Lane",
      "Sadler's Wells",
      "The Playhouse",
      "Sea Life  ",
      "Legoland Discovery Centre",
    ]) {
      expect(scaleOf({ venueName }), venueName).toBe("large");
    }
  });

  it("leaves small venues and namesakes alone", () => {
    for (const venueName of [
      "Hare And Hounds Kings Heath",
      "Kings Head Theatre",
      "Charing Cross Theatre",
      "The Yard Theatre",
      "Gasworks",
      "London LGBTQ+ Community Centre",
      "West End Playhouse Morecambe",
    ]) {
      expect(scaleOf({ venueName }), venueName).toBe("unknown");
    }
  });

  it("uses venue capacity when known, with 300 as the cutoff", () => {
    expect(scaleOf({ venueCapacity: 300 })).toBe("large");
    expect(scaleOf({ venueCapacity: 299 })).toBe("community");
    // A known small capacity beats the name list and the provider rule.
    expect(scaleOf({ venueCapacity: 120, venueName: "Arena Bar", sourceProvider: "ticketmaster" })).toBe("community");
  });

  it("flags touring productions and arena-level prices", () => {
    expect(scaleOf({ title: "Big Band — UK Tour 2027" })).toBe("large");
    expect(scaleOf({ title: "The Farewell Tour" })).toBe("large");
    expect(scaleOf({ priceMax: 120 })).toBe("large");
    expect(scaleOf({ priceMax: 45 })).toBe("unknown");
    expect(scaleOf({ title: "Guided tour of the archive" })).toBe("unknown");
  });

  it("treats Ticketmaster inventory as large", () => {
    expect(scaleOf({ sourceProvider: "ticketmaster" })).toBe("large");
  });

  it("records every reason", () => {
    const r = assessScale(input({ venueName: "The O2", title: "World Tour", sourceProvider: "ticketmaster" }));
    expect(r.reasons).toHaveLength(3);
  });
});

describe("passesPublicGate", () => {
  const queer = { confidence: 0.9, assigned_by: "keyword", buckets: { slug: "queer" } };
  const culture = { confidence: 0.85, assigned_by: "source-mission", buckets: { slug: "community-culture" } };
  const stepFree = { confidence: 0.95, assigned_by: "venue-accessibility", buckets: { slug: "disability-friendly" } };

  it("shows community-scale and unscored events with a qualifying bucket", () => {
    expect(passesPublicGate({ scale: "unknown", event_buckets: [queer] })).toBe(true);
    expect(passesPublicGate({ scale: null, event_buckets: [culture] })).toBe(true);
    expect(passesPublicGate({ event_buckets: [culture] })).toBe(true);
  });

  it("hides large events whatever their buckets", () => {
    expect(passesPublicGate({ scale: "large", event_buckets: [queer, culture] })).toBe(false);
  });

  it("never shows an event on an access tag alone", () => {
    expect(passesPublicGate({ scale: "community", event_buckets: [stepFree] })).toBe(false);
  });
});
