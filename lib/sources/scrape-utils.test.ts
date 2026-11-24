import { describe, it, expect } from "vitest";
import { parseDayRange } from "@/lib/sources/scrape-utils";
import { parseExhibitionRange } from "@/lib/sources/design-museum";

describe("parseDayRange", () => {
  it("parses a date followed by a start time (Ladbroke Hall, Nov 2026)", () => {
    const { startAt, endAt } = parseDayRange("Wednesday 25 November - 7:00pm");
    expect(startAt).not.toBeNull();
    expect(startAt!.getDate()).toBe(25);
    expect(startAt!.getMonth()).toBe(10);
    expect(startAt!.getHours()).toBe(19);
    expect(startAt!.getMinutes()).toBe(0);
    expect(endAt).toBeNull();
  });

  it("still parses a two-date range", () => {
    const { startAt, endAt } = parseDayRange("8 – 13 September 2026");
    expect(startAt!.getDate()).toBe(8);
    expect(endAt!.getDate()).toBe(13);
    expect(endAt!.getFullYear()).toBe(2026);
  });

  it("does not mistake a day-only range end for a time", () => {
    const { startAt, endAt } = parseDayRange("15 September-19 September");
    expect(startAt!.getDate()).toBe(15);
    expect(endAt!.getDate()).toBe(19);
  });
});

describe("parseExhibitionRange (Design Museum)", () => {
  it("parses a range where both sides carry a year", () => {
    const { startAt, endAt } = parseExhibitionRange("6 November 2026 – 8 August 2027");
    expect(new Date(startAt!).getFullYear()).toBe(2026);
    expect(new Date(endAt!).getFullYear()).toBe(2027);
  });

  it("rolls a year-less start back when the range crosses New Year", () => {
    const { startAt, endAt } = parseExhibitionRange("1 December – 4 March 2027");
    expect(new Date(startAt!).getFullYear()).toBe(2026);
    expect(new Date(endAt!).getFullYear()).toBe(2027);
  });
});
