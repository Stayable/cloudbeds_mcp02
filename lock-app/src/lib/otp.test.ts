import { describe, it, expect } from "vitest";
import { generateOtpCode, normalizeOtpInput, otpMatches, pickOtpMatch, isDuplicateOtpRequest } from "./otp";

describe("generateOtpCode", () => {
  it("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe("normalizeOtpInput", () => {
  it("keeps only the digits", () => {
    expect(normalizeOtpInput("1 2 3 4 5 6")).toBe("123456");
    expect(normalizeOtpInput("123-456")).toBe("123456");
    expect(normalizeOtpInput("\t048213\n")).toBe("048213");
  });
});

describe("otpMatches", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  const future = new Date("2026-06-23T12:10:00Z");
  const past = new Date("2026-06-23T11:50:00Z");

  it("accepts a matching, unused, unexpired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "123456", now)).toBe(true);
  });
  it("rejects a wrong code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "000000", now)).toBe(false);
  });
  // A code copied out of the email can pick up separators on the way to the
  // field; the shape of the paste must not decide whether the user gets in.
  it("accepts a code pasted with spaces, dashes or a trailing newline", () => {
    const stored = { code: "123456", used: false, expiresAt: future };
    expect(otpMatches(stored, "1 2 3 4 5 6", now)).toBe(true);
    expect(otpMatches(stored, "123-456", now)).toBe(true);
    expect(otpMatches(stored, "  123456\n", now)).toBe(true);
  });
  it("rejects a used code", () => {
    expect(otpMatches({ code: "123456", used: true, expiresAt: future }, "123456", now)).toBe(false);
  });
  it("rejects an expired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: past }, "123456", now)).toBe(false);
  });
  it("rejects a null stored code", () => {
    expect(otpMatches({ code: null, used: false, expiresAt: future }, "123456", now)).toBe(false);
  });
});

describe("pickOtpMatch", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  const future = new Date("2026-06-23T12:10:00Z");
  const past = new Date("2026-06-23T11:50:00Z");
  const link = (over: Partial<{ id: string; code: string | null; used: boolean; expiresAt: Date }>) => ({
    id: "l1", code: "111111", used: false, expiresAt: future, ...over,
  });

  it("returns null when there are no outstanding codes", () => {
    expect(pickOtpMatch([], "111111", now)).toBeNull();
  });

  it("matches the newest code", () => {
    const rows = [link({ id: "new", code: "222222" }), link({ id: "old", code: "111111" })];
    expect(pickOtpMatch(rows, "222222", now)?.id).toBe("new");
  });

  // The bug: a double-submit mints two codes and emails both. Whichever the guest
  // types must work — not only the newest row.
  it("matches an OLDER outstanding code when two were minted at once", () => {
    const rows = [link({ id: "new", code: "222222" }), link({ id: "old", code: "111111" })];
    expect(pickOtpMatch(rows, "111111", now)?.id).toBe("old");
  });

  it("ignores used and expired rows even if the digits match", () => {
    expect(pickOtpMatch([link({ used: true })], "111111", now)).toBeNull();
    expect(pickOtpMatch([link({ expiresAt: past })], "111111", now)).toBeNull();
  });

  it("returns null for a wrong code", () => {
    expect(pickOtpMatch([link({})], "999999", now)).toBeNull();
  });

  it("tolerates surrounding whitespace in the typed code", () => {
    expect(pickOtpMatch([link({})], " 111111 ", now)?.id).toBe("l1");
  });
});

describe("isDuplicateOtpRequest", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);

  it("is false when nothing is outstanding", () => {
    expect(isDuplicateOtpRequest(null, now)).toBe(false);
  });

  it("is true for a second request moments after the first (double-click)", () => {
    const latest = { createdAt: at(400), expiresAt: new Date("2026-06-23T12:15:00Z") };
    expect(isDuplicateOtpRequest(latest, now)).toBe(true);
  });

  it("is false once the window passes — a genuine resend still gets a fresh code", () => {
    const latest = { createdAt: at(60_000), expiresAt: new Date("2026-06-23T12:14:00Z") };
    expect(isDuplicateOtpRequest(latest, now)).toBe(false);
  });

  it("is false when the outstanding code has already expired", () => {
    const latest = { createdAt: at(400), expiresAt: at(1) };
    expect(isDuplicateOtpRequest(latest, now)).toBe(false);
  });
});
