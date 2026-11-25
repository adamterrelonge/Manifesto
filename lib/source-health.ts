// Per-source health for the daily ingest (scripts/source-health.ts).
//
// Scrapers break silently: a venue redesigns its site, the adapter's
// selectors stop matching, and it just returns 0 events forever. Nothing
// errors, so without this the site quietly loses coverage. Each run is
// compared against recent history (kept in the Actions cache) and sorted
// into:
//
//   broken   — fails the job, so GitHub emails the repo owner:
//              the whole source threw, it dropped to 0 after returning
//              events last run, or most fetched events failed to upsert.
//   warn     — worth a look, doesn't fail the job: per-event errors, a
//              sharp drop against its recent median, or empty for a long
//              stretch.
//   empty    — 0 events and nothing suggests that's wrong (small venues
//              between programmes, e.g. DadaFest between festivals).
//   skipped  — deliberately not run (see SourceResult.skipped).
//   ok
//
// "Dropped to 0" only alerts on the transition run, not every day after —
// a venue that's genuinely between seasons would otherwise fail the job
// daily. A source that stays empty escalates to `warn` after
// LONG_EMPTY_RUNS so a missed break still surfaces eventually.

export interface SourceRunResult {
  fetched: number;
  upserted: number;
  errors: string[];
  skipped?: string;
  fatal?: string;
  /** events.source_provider the source writes (see runSource). */
  provider?: string;
}

/** runYield's output (lib/pipeline.ts), keyed by events.source_provider. */
export interface YieldReport {
  live: number;
  shown: number;
  byProvider: Record<string, { live: number; shown: number }>;
}

export interface SourceSnapshot {
  fetched: number;
  upserted: number;
  errorCount: number;
  skipped?: string;
  fatal?: string;
  /** Live events in the public window / of those, publicly shown. Absent
   *  when the run had no yield data (older history entries, failed stage). */
  live?: number;
  shown?: number;
}

export interface HistoryEntry {
  at: string;
  sources: Record<string, SourceSnapshot>;
}

export type HealthStatus = "broken" | "warn" | "empty" | "skipped" | "ok";

export interface SourceHealth {
  name: string;
  status: HealthStatus;
  reason: string;
  snapshot: SourceSnapshot;
  firstError?: string;
}

export const HISTORY_LIMIT = 30;
export const LONG_EMPTY_RUNS = 14;
const LOW_UPSERT_RATIO = 0.5;
const LOW_UPSERT_MIN_FETCHED = 5;
const SHARP_DROP_MIN_MEDIAN = 20;
const SHARP_DROP_RATIO = 0.25;
const MEDIAN_WINDOW = 7;

export function snapshotRun(
  sources: Record<string, SourceRunResult>,
  yieldReport?: YieldReport
): Record<string, SourceSnapshot> {
  const out: Record<string, SourceSnapshot> = {};
  for (const [name, s] of Object.entries(sources)) {
    const y = yieldReport && s.provider ? (yieldReport.byProvider[s.provider] ?? { live: 0, shown: 0 }) : undefined;
    out[name] = {
      fetched: s.fetched,
      upserted: s.upserted,
      errorCount: s.errors.length,
      ...(s.skipped ? { skipped: s.skipped } : {}),
      ...(s.fatal ? { fatal: s.fatal } : {}),
      ...(y ? { live: y.live, shown: y.shown } : {}),
    };
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `history` is oldest-first and must not include the current run.
// Yield never changes a source's status: a source that fetches fine but has
// nothing public is a gating question, not a breakage. It's reported in its
// own section by renderHealthMarkdown.
export function assessSourceHealth(
  sources: Record<string, SourceRunResult>,
  history: HistoryEntry[],
  yieldReport?: YieldReport
): SourceHealth[] {
  const current = snapshotRun(sources, yieldReport);
  const results: SourceHealth[] = [];

  for (const [name, snap] of Object.entries(current)) {
    const firstError = sources[name].errors[0];
    const past = history.map((h) => h.sources[name]).filter((s): s is SourceSnapshot => !!s);
    const prev = past.at(-1);
    const health = (status: HealthStatus, reason: string): SourceHealth => ({
      name,
      status,
      reason,
      snapshot: snap,
      ...(firstError ? { firstError } : {}),
    });

    if (snap.skipped) {
      results.push(health("skipped", snap.skipped));
      continue;
    }
    if (snap.fatal) {
      results.push(health("broken", `whole source failed: ${snap.fatal}`));
      continue;
    }

    if (snap.fetched === 0) {
      if (prev && !prev.skipped && !prev.fatal && prev.fetched > 0) {
        results.push(health("broken", `dropped to 0 (was ${prev.fetched} last run)`));
        continue;
      }
      let emptyRuns = 1;
      for (let i = past.length - 1; i >= 0 && past[i].fetched === 0; i--) emptyRuns++;
      const everHadEvents = past.some((p) => p.fetched > 0);
      if (emptyRuns >= LONG_EMPTY_RUNS) {
        results.push(
          health("warn", `empty for ${emptyRuns} runs${everHadEvents ? "" : " (never returned events in recorded history)"}`)
        );
      } else {
        results.push(health("empty", emptyRuns > 1 ? `empty for ${emptyRuns} runs` : "0 events this run"));
      }
      continue;
    }

    if (snap.fetched >= LOW_UPSERT_MIN_FETCHED && snap.upserted / snap.fetched < LOW_UPSERT_RATIO) {
      results.push(health("broken", `only ${snap.upserted} of ${snap.fetched} events saved`));
      continue;
    }

    const recent = past.slice(-MEDIAN_WINDOW).filter((p) => !p.skipped && !p.fatal).map((p) => p.fetched);
    const med = median(recent);
    if (med >= SHARP_DROP_MIN_MEDIAN && snap.fetched < med * SHARP_DROP_RATIO) {
      results.push(health("warn", `sharp drop: ${snap.fetched} vs recent median ${med}`));
      continue;
    }

    if (snap.errorCount > 0) {
      results.push(health("warn", `${snap.errorCount} event error${snap.errorCount === 1 ? "" : "s"}`));
      continue;
    }

    results.push(health("ok", `${snap.fetched} events`));
  }

  const order: Record<HealthStatus, number> = { broken: 0, warn: 1, empty: 2, skipped: 3, ok: 4 };
  return results.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}

export function appendHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...history, entry].slice(-HISTORY_LIMIT);
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 200);
}

const ICON: Record<HealthStatus, string> = {
  broken: "🔴",
  warn: "🟡",
  empty: "⚪",
  skipped: "⏭️",
  ok: "🟢",
};

/** Sources with at least this many live events but none shown are listed
 *  as "not reaching users" — below it, 0 shown is just a small programme. */
export const ZERO_SHOWN_MIN_LIVE = 3;
const TOP_YIELD_ROWS = 15;

function pct(shown: number, live: number): string {
  return live === 0 ? "–" : `${Math.round((shown / live) * 100)}%`;
}

export function renderYieldMarkdown(health: SourceHealth[], yieldReport: YieldReport): string {
  const withYield = health.filter((h) => h.snapshot.live !== undefined);
  const lines = [
    "## Reaching users",
    "",
    `**${yieldReport.shown}** of ${yieldReport.live} live events in the public window are shown (${pct(yieldReport.shown, yieldReport.live)}).`,
    "",
  ];

  const byLive = [...withYield]
    .filter((h) => (h.snapshot.live ?? 0) > 0)
    .sort((a, b) => (b.snapshot.live ?? 0) - (a.snapshot.live ?? 0) || a.name.localeCompare(b.name));
  if (byLive.length > 0) {
    lines.push("| Source | Fetched | Live | Shown | % |", "|---|---|---|---|---|");
    for (const h of byLive.slice(0, TOP_YIELD_ROWS)) {
      const { fetched, live = 0, shown = 0 } = h.snapshot;
      lines.push(`| ${h.name} | ${fetched} | ${live} | ${shown} | ${pct(shown, live)} |`);
    }
    lines.push("");
  }

  const notReaching = withYield
    .filter((h) => (h.snapshot.live ?? 0) >= ZERO_SHOWN_MIN_LIVE && h.snapshot.shown === 0)
    .map((h) => `${h.name} (${h.snapshot.live})`);
  if (notReaching.length > 0) {
    lines.push(
      `**Live events but none shown** (${notReaching.length}): ${notReaching.join(", ")}`,
      ""
    );
  }

  return lines.join("\n") + "\n";
}

export function renderHealthMarkdown(health: SourceHealth[], historyRuns: number): string {
  const count = (s: HealthStatus) => health.filter((h) => h.status === s).length;
  const lines = [
    "## Source health",
    "",
    `${ICON.broken} ${count("broken")} broken · ${ICON.warn} ${count("warn")} warn · ` +
      `${ICON.empty} ${count("empty")} empty · ${ICON.skipped} ${count("skipped")} skipped · ` +
      `${ICON.ok} ${count("ok")} ok — compared against ${historyRuns} previous run${historyRuns === 1 ? "" : "s"}`,
    "",
  ];
  const notable = health.filter((h) => h.status !== "ok");
  if (notable.length > 0) {
    lines.push("| | Source | Fetched / saved | Why | First error |", "|---|---|---|---|---|");
    for (const h of notable) {
      lines.push(
        `| ${ICON[h.status]} | ${h.name} | ${h.snapshot.fetched} / ${h.snapshot.upserted} | ${cell(h.reason)} | ${cell(h.firstError ?? "")} |`
      );
    }
  }
  return lines.join("\n") + "\n";
}
