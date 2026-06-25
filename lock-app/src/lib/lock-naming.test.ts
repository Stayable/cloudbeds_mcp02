import { describe, it, expect } from "vitest";
import { parseLockName, classifyLock, canonicalLockName } from "./lock-naming";

describe("parseLockName", () => {
  it("maps a conforming name to property + room", () => {
    expect(parseLockName("KE-105")).toEqual({ propertyId: "210986", room: "105" });
    expect(parseLockName("LL-202")).toEqual({ propertyId: "210972", room: "202" });
  });

  it("is case-insensitive on the abbreviation", () => {
    expect(parseLockName("ke-105")).toEqual({ propertyId: "210986", room: "105" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseLockName("  KE-105  ")).toEqual({ propertyId: "210986", room: "105" });
  });

  it("keeps a room token that itself contains a hyphen", () => {
    expect(parseLockName("JW-1-A")).toEqual({ propertyId: "210987", room: "1-A" });
  });

  it("returns null for an unknown abbreviation", () => {
    expect(parseLockName("XX-105")).toBeNull();
  });

  it("returns null when there is no hyphen", () => {
    expect(parseLockName("105")).toBeNull();
  });

  it("returns null for an empty room token", () => {
    expect(parseLockName("KE-")).toBeNull();
  });

  it("returns null for a non-conforming name like the trial lock", () => {
    expect(parseLockName("lobby-HVAC unit room")).toBeNull();
  });
});

describe("classifyLock", () => {
  it("maps a conforming name regardless of current mapping state", () => {
    expect(classifyLock("KE-105", false)).toEqual({ kind: "map", propertyId: "210986", room: "105" });
  });

  it("re-maps a conforming name even if the lock is already mapped (handles rename)", () => {
    expect(classifyLock("KE-105", true)).toEqual({ kind: "map", propertyId: "210986", room: "105" });
  });

  it("queues a non-conforming lock that is not yet mapped", () => {
    expect(classifyLock("lobby-HVAC unit room", false)).toEqual({ kind: "queue" });
  });

  it("keeps a non-conforming lock that is already mapped (never re-queue a manual mapping)", () => {
    expect(classifyLock("lobby-HVAC unit room", true)).toEqual({ kind: "keep" });
  });
});

describe("canonicalLockName", () => {
  it("builds <ABBR>-<room> from a property + room", () => {
    expect(canonicalLockName("210986", "105")).toBe("KE-105");
    expect(canonicalLockName("210972", "202")).toBe("LL-202");
  });

  it("trims the room token", () => {
    expect(canonicalLockName("210986", "  105 ")).toBe("KE-105");
  });

  it("round-trips with parseLockName", () => {
    const name = canonicalLockName("210987", "1-A");
    expect(name).toBe("JW-1-A");
    expect(parseLockName(name!)).toEqual({ propertyId: "210987", room: "1-A" });
  });

  it("returns null for an unknown property", () => {
    expect(canonicalLockName("999999", "105")).toBeNull();
  });

  it("returns null for an empty room", () => {
    expect(canonicalLockName("210986", "  ")).toBeNull();
  });
});
