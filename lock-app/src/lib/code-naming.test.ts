import { describe, it, expect } from "vitest";
import { backupCodeLabel, fullCodeName, sanitizeLabel, MAX_LABEL_LEN } from "./code-naming";

describe("backupCodeLabel", () => {
  it("defaults to 'Backup N' when there's no custom label", () => {
    expect(backupCodeLabel(1)).toBe("Backup 1");
    expect(backupCodeLabel(3, null)).toBe("Backup 3");
    expect(backupCodeLabel(2, "   ")).toBe("Backup 2");
  });
  it("uses a trimmed custom label when present", () => {
    expect(backupCodeLabel(1, "  Maintenance  ")).toBe("Maintenance");
  });
});

describe("fullCodeName", () => {
  it("prefixes the abbreviation", () => {
    expect(fullCodeName("LL", "Maintenance")).toBe("LL-Maintenance");
    expect(fullCodeName("LL", "Backup 1")).toBe("LL-Backup 1");
  });
  it("omits the prefix when abbr is blank", () => {
    expect(fullCodeName("", "Maintenance")).toBe("Maintenance");
  });
});

describe("sanitizeLabel", () => {
  it("trims and collapses internal whitespace", () => {
    expect(sanitizeLabel("  Front   Desk  ")).toBe("Front Desk");
  });
  it("strips disallowed characters", () => {
    expect(sanitizeLabel("Ma<i>nt*enance!")).toBe("Maintenance");
  });
  it("keeps a few separators", () => {
    expect(sanitizeLabel("HK/Laundry #2 & Rob")).toBe("HK/Laundry #2 & Rob");
  });
  it("caps at MAX_LABEL_LEN", () => {
    const long = "A".repeat(MAX_LABEL_LEN + 10);
    expect(sanitizeLabel(long)).toHaveLength(MAX_LABEL_LEN);
  });
  it("returns '' for all-whitespace or fully-stripped input", () => {
    expect(sanitizeLabel("   ")).toBe("");
    expect(sanitizeLabel("<<<>>>")).toBe("");
  });
});
