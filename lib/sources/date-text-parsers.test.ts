import { describe, it, expect } from "vitest";
import { parsePosttitle } from "@/lib/sources/national-museum-scotland";
import { parseDateRange } from "@/lib/sources/sainsbury-centre";

// Both parsers build local-time dates (parseDMY), so assert on local fields.
const local = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

describe("National Museum of Scotland parsePosttitle", () => {
  it("reads a dated range", () => {
    const r = parsePosttitle("Sat 12 Jun 2027 - Sun 14 Nov 2027");
    expect(local(r.startAt)).toEqual([2027, 6, 12, 0, 0]);
    expect(local(r.endAt)).toEqual([2027, 11, 14, 0, 0]);
  });

  it("ignores the daily time slot on a recurring run", () => {
    const r = parsePosttitle("Sat 23 May 2026 – Sat 27 Mar 2027, 10:30 - 12:00");
    expect(local(r.startAt)).toEqual([2026, 5, 23, 0, 0]);
    expect(local(r.endAt)).toEqual([2027, 3, 27, 0, 0]);
  });

  it("applies the start time to a single-day event", () => {
    const r = parsePosttitle("Fri 22 Jan 2027, 19:30 - 23:00");
    expect(local(r.startAt)).toEqual([2027, 1, 22, 19, 30]);
    expect(r.endAt).toBeNull();
  });

  it("uses the first of several listed dates", () => {
    const r = parsePosttitle("Tue 8 Dec 2026 and Thu 10 Dec 2026, 18:00 - 20:30 (doors open 17:30)");
    expect(local(r.startAt)).toEqual([2026, 12, 8, 18, 0]);
  });

  it("puts a yearless start in the year before when it would fall after the end", () => {
    const r = parsePosttitle("Sat 19 Dec - Sun 3 Jan 2027");
    expect(local(r.startAt)).toEqual([2026, 12, 19, 0, 0]);
  });

  it("returns nulls when there is no date", () => {
    expect(parsePosttitle("Daily, 10:00 - 17:00")).toEqual({ startAt: null, endAt: null });
  });
});

describe("Sainsbury Centre parseDateRange", () => {
  it("reads a range where each side has its own year", () => {
    const r = parseDateRange("13 Nov 2026 - 11 Apr 2027");
    expect(local(r.startAt)).toEqual([2026, 11, 13, 0, 0]);
    expect(local(r.endAt)).toEqual([2027, 4, 11, 0, 0]);
  });

  it("shares a trailing year with a yearless start", () => {
    const r = parseDateRange("16 May - 15 November 2026");
    expect(local(r.startAt)).toEqual([2026, 5, 16, 0, 0]);
  });

  it("rolls a yearless start back a year across New Year", () => {
    const r = parseDateRange("18 Dec - 5 Jan 2027");
    expect(local(r.startAt)).toEqual([2026, 12, 18, 0, 0]);
  });

  it("reads a single date", () => {
    const r = parseDateRange("22 Dec 2026");
    expect(local(r.startAt)).toEqual([2026, 12, 22, 0, 0]);
    expect(r.endAt).toBeNull();
  });

  it("returns nulls for an empty date (undated cards)", () => {
    expect(parseDateRange("")).toEqual({ startAt: null, endAt: null });
  });
});
