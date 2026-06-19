import { describe, it, expect } from "vitest";
import { buildDetail } from "./audit";

describe("buildDetail", () => {
  it("defaults outcome to success", () => {
    expect(buildDetail({})).toEqual({ outcome: "success" });
  });
  it("passes through outcome, message, reservationId and extra", () => {
    const d = buildDetail({ outcome: "warning", message: "drift", reservationId: "R1", extra: { missingOnLock: ["2"] } });
    expect(d).toMatchObject({ outcome: "warning", message: "drift", reservationId: "R1", missingOnLock: ["2"] });
  });
  it("renders a masked before→after change when both pins are given", () => {
    const d = buildDetail({ beforePin: "111111", afterPin: "909090" });
    expect(d.change).toBe("••••11 → ••••90");
  });
});
