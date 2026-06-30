import { describe, it, expect } from "vitest";
import { firstNameOf, propertyDisplayName } from "./guest-notify";

describe("firstNameOf", () => {
  it("returns the first token", () => {
    expect(firstNameOf("Alexander Hamilton")).toBe("Alexander");
  });
  it("handles single names and extra spaces", () => {
    expect(firstNameOf("  Madonna ")).toBe("Madonna");
  });
  it("returns null for empty/nullish", () => {
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe("propertyDisplayName", () => {
  it("prefixes the property name with Stayable", () => {
    expect(propertyDisplayName("210972")).toBe("Stayable Lakeland");
  });
  it("falls back to Stayable for an unknown id", () => {
    expect(propertyDisplayName("000000")).toBe("Stayable");
  });
});
