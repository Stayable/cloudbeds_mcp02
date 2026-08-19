import { describe, it, expect } from "vitest";
import { buildOtpEmail, senderFrom } from "./email";

describe("senderFrom", () => {
  it("wraps a bare address with the Stayable Locks display name", () => {
    expect(senderFrom("admin@rentstayable.com")).toBe("Stayable Locks <admin@rentstayable.com>");
  });
  it("leaves a full 'Name <addr>' value untouched", () => {
    expect(senderFrom("Front Desk <admin@rentstayable.com>")).toBe("Front Desk <admin@rentstayable.com>");
  });
  it("trims whitespace and falls back when unset", () => {
    expect(senderFrom("  admin@rentstayable.com  ")).toBe("Stayable Locks <admin@rentstayable.com>");
    expect(senderFrom(undefined)).toBe("Stayable Locks <admin@rentstayable.com>");
    expect(senderFrom("")).toBe("Stayable Locks <admin@rentstayable.com>");
  });
});

describe("buildOtpEmail", () => {
  const code = "048213";
  const built = buildOtpEmail(code);

  it("puts the code in the subject", () => {
    expect(built.subject).toContain(code);
  });
  it("includes the code in the HTML body", () => {
    expect(built.html).toContain(code);
  });
  // The code has to survive copy → paste into a pattern="\d{6}" field, so it
  // must render as ONE text run. Per-digit table cells copy as "0 4 8 2 1 3".
  it("renders the code as a single contiguous run, not per-digit cells", () => {
    expect(built.html).toContain(`>${code}<`);
    expect(built.html).not.toMatch(new RegExp(code.split("").join("<")));
  });
  it("puts the code alone on its own line in the plain-text body", () => {
    expect(built.text).toMatch(new RegExp(`\\n${code}\\n`));
  });
  it("includes the code in the plain-text body", () => {
    expect(built.text).toContain(code);
  });
  it("states the 15-minute expiry in both bodies", () => {
    expect(built.html).toMatch(/15 minutes/);
    expect(built.text).toMatch(/15 minutes/);
  });
  it("is Stayable-branded, not Investor Portal", () => {
    expect(built.html).toContain("Stayable");
    expect(built.html).not.toContain("Investor Portal");
  });
});
