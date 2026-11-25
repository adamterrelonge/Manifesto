// Source health check for the daily ingest — see lib/source-health.ts for
// the rules.
//
//   npm run health [-- path/to/ingest-latest.json]
//
// Reads the ingest result scripts/ingest.ts wrote, compares it against
// .cache/source-history.json (the last 30 runs, persisted between Actions
// runs by the workflow's cache), appends this run, and prints a report —
// also to the job summary when GITHUB_STEP_SUMMARY is set. Exits 1 when any
// source is broken, which fails the workflow and triggers GitHub's
// failed-run email.
//
// Running it twice on the same result (e.g. locally) re-reports without
// appending a duplicate history entry.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  appendHistory,
  assessSourceHealth,
  renderHealthMarkdown,
  renderYieldMarkdown,
  snapshotRun,
  type HistoryEntry,
  type SourceRunResult,
  type YieldReport,
} from "@/lib/source-health";

const RESULT_PATH = process.argv[2] ?? ".cache/ingest-latest.json";
const HISTORY_PATH = ".cache/source-history.json";

function main() {
  if (!existsSync(RESULT_PATH)) {
    console.error(`No ingest result at ${RESULT_PATH} — did the ingest step run?`);
    process.exit(1);
  }
  const result = JSON.parse(readFileSync(RESULT_PATH, "utf8")) as {
    finishedAt?: string;
    sources: Record<string, SourceRunResult>;
    yield?: YieldReport | { error: string };
  };
  const yieldReport = result.yield && !("error" in result.yield) ? result.yield : undefined;
  if (result.yield && "error" in result.yield) console.warn(`Yield stage failed: ${result.yield.error}`);
  const at = result.finishedAt ?? new Date().toISOString();

  let history: HistoryEntry[] = [];
  if (existsSync(HISTORY_PATH)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
    } catch {
      console.warn(`Ignoring unreadable ${HISTORY_PATH}`);
    }
  }

  const alreadyRecorded = history.at(-1)?.at === at;
  if (alreadyRecorded && process.env.CI) {
    // In Actions the result file comes from the restored cache unless the
    // ingest step wrote a new one — so this means ingest died before
    // finishing, and reporting the old numbers would be misleading.
    console.error(`${RESULT_PATH} is from a previous run (${at}) — the ingest step did not finish.`);
    process.exit(1);
  }
  const baseline = alreadyRecorded ? history.slice(0, -1) : history;

  const health = assessSourceHealth(result.sources, baseline, yieldReport);
  const markdown =
    renderHealthMarkdown(health, baseline.length) + (yieldReport ? "\n" + renderYieldMarkdown(health, yieldReport) : "");

  if (!alreadyRecorded) {
    const updated = appendHistory(history, { at, sources: snapshotRun(result.sources, yieldReport) });
    mkdirSync(dirname(HISTORY_PATH), { recursive: true });
    writeFileSync(HISTORY_PATH, JSON.stringify(updated));
  }

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  const broken = health.filter((h) => h.status === "broken");
  if (broken.length > 0) {
    console.error(`FAILED: ${broken.length} broken source(s): ${broken.map((b) => b.name).join(", ")}`);
    process.exit(1);
  }
}

main();
