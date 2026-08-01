// Lightweight, deterministic spam/quality scoring — no external calls.
// Catches obviously-broken or junk listings before they reach users.
// Matters more once Phase 4's bio-link scraper and manual submissions
// bring in untrusted free-text content; today's structured APIs (Skiddle,
// Ticketmaster) are low-risk, but this establishes the gate ahead of that.

export interface QualityCheckEvent {
  title: string;
  description: string | null;
  venueId: string | null;
  imageUrl: string | null;
}

export interface QualityResult {
  score: number; // 0..1, higher = better quality
  flags: string[];
}

export const QUALITY_THRESHOLD = 0.5;

const MIN_TITLE_LENGTH = 4;
const REPEATED_CHAR_PATTERN = /(.)\1{4,}/; // e.g. "!!!!!" or "aaaaa"
const EXCESSIVE_PUNCTUATION_PATTERN = /[!?]{3,}/;

export function scoreEventQuality(event: QualityCheckEvent): QualityResult {
  let score = 1;
  const flags: string[] = [];
  const title = event.title.trim();

  if (title.length < MIN_TITLE_LENGTH) {
    score -= 0.5;
    flags.push("title too short");
  }

  if (REPEATED_CHAR_PATTERN.test(title)) {
    score -= 0.4;
    flags.push("repeated characters in title");
  }

  if (EXCESSIVE_PUNCTUATION_PATTERN.test(title)) {
    score -= 0.2;
    flags.push("excessive punctuation in title");
  }

  const hasLetters = /[a-zA-Z]/.test(title);
  if (hasLetters && title === title.toUpperCase() && title.length > 8) {
    score -= 0.15;
    flags.push("all-caps title");
  }

  if (!event.description || event.description.trim().length < 15) {
    score -= 0.15;
    flags.push("missing or very short description");
  }

  if (!event.venueId) {
    score -= 0.2;
    flags.push("no matched venue");
  }

  if (!event.imageUrl) {
    score -= 0.05;
    flags.push("no image");
  }

  return { score: Math.max(0, Math.min(1, score)), flags };
}
