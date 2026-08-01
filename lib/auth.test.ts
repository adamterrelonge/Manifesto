import { describe, it, expect } from "vitest";
import { isValidBearerSecret } from "@/lib/auth";

describe("isValidBearerSecret", () => {
  it("accepts an exact match", () => {
    expect(isValidBearerSecret("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isValidBearerSecret("Bearer wrong", "s3cret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isValidBearerSecret(null, "s3cret")).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    expect(isValidBearerSecret("Bearer anything", undefined)).toBe(false);
  });

  it("rejects an empty configured secret", () => {
    expect(isValidBearerSecret("Bearer ", "")).toBe(false);
  });

  it("does not throw on mismatched lengths (timingSafeEqual would)", () => {
    expect(() => isValidBearerSecret("Bearer short", "a-much-longer-secret")).not.toThrow();
    expect(isValidBearerSecret("Bearer short", "a-much-longer-secret")).toBe(false);
  });

  it("rejects a header missing the 'Bearer ' prefix", () => {
    expect(isValidBearerSecret("s3cret", "s3cret")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidBearerSecret("Bearer S3CRET", "s3cret")).toBe(false);
  });
});
