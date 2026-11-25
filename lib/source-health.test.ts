import { describe, it, expect } from "vitest";
import {
  appendHistory,
  assessSourceHealth,
  HISTORY_LIMIT,
  LONG_EMPTY_RUNS,
  renderHealthMarkdown,
  renderYieldMarkdown,
  snapshotRun,
  type HistoryEntry,
  type SourceRunResult,
} from "@/lib/source-health";

const run = (fetched: number, extra: Partial<SourceRunResult> = {}): SourceRunResult => ({
  fetched,
  upserted: fetched,
  errors: [],
  ...extra,
});

const entry = (sources: Record<string, SourceRunResult>, at = "2026-11-01T05:00:00Z"): HistoryEntry => ({
  at,
  sources: snapshotRun(sources),
});

function statusOf(sources: Record<string, SourceRunResult>, history: HistoryEntry[] = []) {
  return Object.fromEntries(assessSourceHealth(sources, history).map((h) => [h.name, h.status]));
}

describe("assessSourceHealth", () => {
  it("marks a source that threw as broken", () => {
    expect(statusOf({ a: run(0, { fatal: "fetch failed", errors: ["a fetch failed"] }) })).toEqual({ a: "broken" });
  });

  it("marks a deliberately skipped source as skipped, not broken", () => {
    expect(statusOf({ a: run(0, { skipped: "token not set" }) }, [entry({ a: run(10) })])).toEqual({ a: "skipped" });
  });

  it("flags a drop to 0 as broken only on the transition run", () => {
    const h1 = [entry({ a: run(12) })];
    expect(statusOf({ a: run(0) }, h1)).toEqual({ a: "broken" });
    const h2 = [...h1, entry({ a: run(0) })];
    expect(statusOf({ a: run(0) }, h2)).toEqual({ a: "empty" });
  });

  it("treats 0 with no history as empty (nothing to compare against)", () => {
    expect(statusOf({ a: run(0) })).toEqual({ a: "empty" });
  });

  it("escalates a long empty stretch to warn", () => {
    const history = Array.from({ length: LONG_EMPTY_RUNS - 1 }, () => entry({ a: run(0) }));
    expect(statusOf({ a: run(0) }, history)).toEqual({ a: "warn" });
    expect(statusOf({ a: run(0) }, history.slice(1))).toEqual({ a: "empty" });
  });

  it("does not count a drop to 0 after a skipped or failed run as a fresh break", () => {
    expect(statusOf({ a: run(0) }, [entry({ a: run(0, { skipped: "x" }) })])).toEqual({ a: "empty" });
  });

  it("marks mostly-failed upserts as broken", () => {
    expect(statusOf({ a: { fetched: 10, upserted: 3, errors: ["db timeout"] } })).toEqual({ a: "broken" });
  });

  it("warns on a sharp drop against the recent median", () => {
    const history = [100, 110, 95].map((n) => entry({ a: run(n) }));
    expect(statusOf({ a: run(10) }, history)).toEqual({ a: "warn" });
    expect(statusOf({ a: run(60) }, history)).toEqual({ a: "ok" });
  });

  it("warns on per-event errors when most events still saved", () => {
    expect(statusOf({ a: { fetched: 10, upserted: 8, errors: ["no start date", "no start date"] } })).toEqual({
      a: "warn",
    });
  });

  it("sorts broken first", () => {
    const names = assessSourceHealth({ z: run(5), a: run(0, { fatal: "x" }) }, []).map((h) => h.name);
    expect(names).toEqual(["a", "z"]);
  });
});

describe("appendHistory", () => {
  it("keeps only the most recent HISTORY_LIMIT runs", () => {
    let history: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history = appendHistory(history, entry({ a: run(i) }, String(i)));
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].at).toBe("5");
  });
});

describe("renderHealthMarkdown", () => {
  it("lists only non-ok sources and escapes table pipes", () => {
    const md = renderHealthMarkdown(
      assessSourceHealth({ good: run(5), bad: run(0, { fatal: "a | b", errors: ["a | b"] }) }, []),
      0
    );
    expect(md).toContain("| bad |");
    expect(md).not.toContain("| good |");
    expect(md).toContain("a \\| b");
  });
});

describe("yield", () => {
  const yieldReport = {
    live: 60,
    shown: 6,
    byProvider: {
      ticketmaster: { live: 50, shown: 1 },
      "bio-link": { live: 5, shown: 5 },
      skiddle: { live: 5, shown: 0 },
    },
  };
  const sources = {
    ticketmaster: run(800, { provider: "ticketmaster" }),
    bioLinks: run(17, { provider: "bio-link" }),
    skiddle: run(600, { provider: "skiddle" }),
    tate: run(26, { provider: "tate" }),
    legacy: run(3),
  };

  it("joins live/shown onto snapshots by provider, 0 when the provider has no live events", () => {
    const snap = snapshotRun(sources, yieldReport);
    expect(snap.bioLinks).toMatchObject({ live: 5, shown: 5 });
    expect(snap.tate).toMatchObject({ live: 0, shown: 0 });
    expect(snap.legacy.live).toBeUndefined();
    expect(snapshotRun(sources).ticketmaster.live).toBeUndefined();
  });

  it("never changes a source's health status", () => {
    const withYield = assessSourceHealth(sources, [], yieldReport).map((h) => [h.name, h.status]);
    const without = assessSourceHealth(sources, []).map((h) => [h.name, h.status]);
    expect(withYield).toEqual(without);
  });

  it("reports totals, the funnel table, and sources with live events but none shown", () => {
    const md = renderYieldMarkdown(assessSourceHealth(sources, [], yieldReport), yieldReport);
    expect(md).toContain("**6** of 60 live events");
    expect(md).toContain("| ticketmaster | 800 | 50 | 1 | 2% |");
    expect(md).toContain("Live events but none shown** (1): skiddle (5)");
    expect(md).not.toContain("| tate |");
  });
});
