import { describe, it, expect } from "vitest";
import { matchesDateFilter } from "@/lib/date-filter";

// Fixed reference point so tests don't depend on the real current time.
const NOW = new Date("2026-08-01T12:00:00Z");

describe("matchesDateFilter", () => {
  // Regression: the original implementation only compared start_at, so an
  // exhibition that opened weeks before "now" but is still running (e.g.
  // Barbican's "Project a Black Planet", 11 Jun – 6 Sep) never matched any
  // filter again after its opening day, even though it was still on.
  it("matches an ongoing multi-month event whose start is in the past", () => {
    const startAt = "2026-06-11T09:00:00Z";
    const endAt = "2026-09-06T16:00:00Z";
    expect(matchesDateFilter(startAt, endAt, "week", NOW)).toBe(true);
    expect(matchesDateFilter(startAt, endAt, "today", NOW)).toBe(true);
  });

  it("does not match an event that already fully ended", () => {
    const startAt = "2026-05-01T09:00:00Z";
    const endAt = "2026-07-01T16:00:00Z"; // ended before NOW
    expect(matchesDateFilter(startAt, endAt, "week", NOW)).toBe(false);
  });

  it("treats a point-in-time event (no end_at) as ending when it starts", () => {
    const pastStart = "2026-07-31T09:00:00Z"; // yesterday, no end_at
    expect(matchesDateFilter(pastStart, null, "week", NOW)).toBe(false);
  });

  it("matches a future point-in-time event within the week window", () => {
    const futureStart = "2026-08-03T09:00:00Z";
    expect(matchesDateFilter(futureStart, null, "week", NOW)).toBe(true);
  });

  it("does not match a point-in-time event beyond the week horizon", () => {
    const farFuture = "2026-08-15T09:00:00Z";
    expect(matchesDateFilter(farFuture, null, "week", NOW)).toBe(false);
  });

  it("'today' matches only events starting before tomorrow", () => {
    expect(matchesDateFilter("2026-08-01T18:00:00Z", null, "today", NOW)).toBe(true);
    expect(matchesDateFilter("2026-08-02T09:00:00Z", null, "today", NOW)).toBe(false);
  });

  it("'tomorrow' matches only events starting in tomorrow's window", () => {
    expect(matchesDateFilter("2026-08-02T09:00:00Z", null, "tomorrow", NOW)).toBe(true);
    expect(matchesDateFilter("2026-08-01T18:00:00Z", null, "tomorrow", NOW)).toBe(false);
    expect(matchesDateFilter("2026-08-03T09:00:00Z", null, "tomorrow", NOW)).toBe(false);
  });
});
