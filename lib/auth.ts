import { timingSafeEqual } from "crypto";

// Shared Bearer-secret check for every mutating route. Two distinct secrets
// use this: INGEST_SECRET (ingest/classify/quality/dedup — system-triggered
// pipeline routes) and ADMIN_SECRET (the human-facing bucket review UI,
// entered into the browser and kept in sessionStorage). Keeping them
// separate means a leak of the browser-side admin secret doesn't also hand
// out pipeline-trigger/write access, and vice versa.
//
// Compares with timingSafeEqual rather than `!==` — a plain string
// comparison on a bearer secret leaks how many leading bytes matched via
// response timing, which a request-heavy attacker could exploit to guess
// the secret byte-by-byte. Length is checked first outside the constant-time
// comparison (timingSafeEqual throws on mismatched lengths); leaking length
// alone isn't a meaningful weakening here.
export function isValidBearerSecret(
  authHeader: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret || !authHeader) return false;

  const provided = Buffer.from(authHeader);
  const expected = Buffer.from(`Bearer ${expectedSecret}`);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}
