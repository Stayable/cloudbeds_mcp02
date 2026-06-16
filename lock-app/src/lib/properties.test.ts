import { describe, it, expect } from "vitest";
import { PROPERTIES, getProperty, visibleProperties } from "./properties";

describe("property catalog", () => {
  it("has all 8 Stayable properties with real Cloudbeds IDs", () => {
    expect(PROPERTIES).toHaveLength(8);
    expect(getProperty("210972")?.name).toBe("Lakeland");
    expect(getProperty("206628")?.name).toBe("Jacksonville North");
  });

  it("returns undefined for an unknown id", () => {
    expect(getProperty("999")).toBeUndefined();
  });

  it("gives an 'all'-scope user every property", () => {
    expect(visibleProperties({ scopeType: "all", propertyIds: [] })).toHaveLength(8);
  });

  it("limits a 'property'-scope user to their assigned ids", () => {
    const v = visibleProperties({ scopeType: "property", propertyIds: ["210972", "210986"] });
    expect(v.map((p) => p.id).sort()).toEqual(["210972", "210986"]);
  });

  it("returns no properties for a 'property'-scope user with no ids", () => {
    expect(visibleProperties({ scopeType: "property", propertyIds: [] })).toHaveLength(0);
  });
});
