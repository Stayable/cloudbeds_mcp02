import { describe, it, expect } from "vitest";
import { buildInviteEmail } from "./user-invite-email";

const base = {
  name: "Gerardo Ruiz",
  email: "gerardo@rentstayable.com",
  roleName: "attendant",
  scopeSummary: "Lakeland",
  url: "https://lock.rentstayable.com",
};

describe("buildInviteEmail", () => {
  it("greets by first name only", () => {
    expect(buildInviteEmail(base).html).toContain("You're in, Gerardo");
  });

  it("falls back to a neutral greeting when the name is blank", () => {
    expect(buildInviteEmail({ ...base, name: "  " }).html).toContain("You're in, there");
  });

  it("states the sign-in address, role, and access scope", () => {
    const { html } = buildInviteEmail(base);
    expect(html).toContain("gerardo@rentstayable.com");
    expect(html).toContain("attendant");
    expect(html).toContain("Lakeland");
  });

  it("links to the app", () => {
    expect(buildInviteEmail(base).html).toContain('href="https://lock.rentstayable.com"');
  });

  it("tells the user there is no password", () => {
    const { html, text } = buildInviteEmail(base);
    expect(html).toMatch(/no password/i);
    expect(text).toMatch(/6-digit code/);
  });

  it("escapes HTML in user-supplied fields", () => {
    const { html } = buildInviteEmail({ ...base, name: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("has a plain-text alternative carrying the same essentials", () => {
    const { text } = buildInviteEmail(base);
    expect(text).toContain("gerardo@rentstayable.com");
    expect(text).toContain("https://lock.rentstayable.com");
  });
});
