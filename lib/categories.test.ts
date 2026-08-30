import { describe, it, expect } from "vitest";
import { inferCategory } from "@/lib/categories";

describe("inferCategory", () => {
  // Regression: "African & Caribbean Market" (real Lewisham Shopping Centre
  // listing) had zero market-fair phrase matches — none of the existing
  // phrases ("art fair", "flea market", ...) covered a plain "Market" in
  // the title.
  it("matches market-fair on a plain 'Market' in the title", () => {
    expect(
      inferCategory(
        "African & Caribbean Market · Every Saturday · Lewisham Shopping Centre",
        "African & Caribbean Black-owned brands every Saturday. Beauty, food, fashion & more."
      )
    ).toBe("market-fair");
  });

  it("does not match market-fair inside a word boundary (e.g. 'supermarket')", () => {
    expect(inferCategory("Supermarket Sweep Night", null)).not.toBe("market-fair");
  });

  // Regression: "Bouchra (15)" (real Firstsite/HOME Manchester listing) had
  // zero film phrase matches — the copy describes "her first film" without
  // ever using an exact matched phrase like "feature film". The BBFC age
  // certificate in the title is a reliable film-only signal instead.
  it("matches film on a BBFC age certificate in the title", () => {
    expect(inferCategory("Bouchra (15)", null)).toBe("film");
  });

  it("still matches film via existing phrases with no certificate present", () => {
    expect(inferCategory("Tuesday Film Club: Short Films Night", null)).toBe("film");
  });
});
