import { describe, it, expect } from "vitest";
import { mapActionError } from "./action-result";

describe("mapActionError", () => {
  it("maps a TTLock gateway-offline failure (-2012) to friendly gateway text", () => {
    const msg = mapActionError(new Error("TTLock keyboardPwd/add failed: errcode=-2012 not connected to any Gateway"));
    expect(msg).toMatch(/gateway/i);
    expect(msg).toMatch(/online/i);
    expect(msg).not.toMatch(/-2012/); // raw code hidden from the operator
  });

  it("maps a generic 'not connected to any Gateway' message even without the code", () => {
    expect(mapActionError(new Error("Lock is not connected to any Gateway"))).toMatch(/gateway/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    const msg = mapActionError(new Error("ECONNRESET socket hang up"));
    expect(msg).toMatch(/try again/i);
    expect(msg).not.toMatch(/ECONNRESET/);
  });

  it("tolerates non-Error throwables", () => {
    expect(typeof mapActionError("boom")).toBe("string");
    expect(typeof mapActionError(null)).toBe("string");
  });
});
