import { describe, it, expect } from "vitest";
import { buildOtpEmail } from "./email";

describe("buildOtpEmail", () => {
  const code = "048213";
  const built = buildOtpEmail(code);

  it("puts the code in the subject", () => {
    expect(built.subject).toContain(code);
  });
  it("includes the code in the HTML body", () => {
    expect(built.html).toContain(code);
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
