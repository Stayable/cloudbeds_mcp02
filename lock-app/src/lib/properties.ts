/**
 * Static catalog of the 8 Stayable properties. IDs are the REAL Cloudbeds
 * propertyIDs (verified live, see CLAUDE.md) — NOT the street-address codes.
 * Editable per-property config (name/timezone overrides) is a Settings concern
 * (Plan 5); this is the read-only source for nav, switcher, and Overview.
 */
export interface Property {
  id: string; // real Cloudbeds propertyID
  name: string;
  streetCode: string; // legacy street-address code (display/reference only)
  timezone: string;
}

export const PROPERTIES: Property[] = [
  { id: "206628", name: "Jacksonville North", streetCode: "812", timezone: "America/New_York" },
  { id: "210987", name: "Jacksonville West", streetCode: "6802", timezone: "America/New_York" },
  { id: "210986", name: "Kissimmee East", streetCode: "2295", timezone: "America/New_York" },
  { id: "210969", name: "Kissimmee West", streetCode: "5399", timezone: "America/New_York" },
  { id: "210972", name: "Lakeland", streetCode: "4645", timezone: "America/New_York" },
  { id: "210971", name: "Orlando OBT", streetCode: "8700", timezone: "America/New_York" },
  { id: "208155", name: "St. Augustine", streetCode: "2535", timezone: "America/New_York" },
  { id: "318197", name: "Davenport", streetCode: "44199", timezone: "America/New_York" },
];

export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

/**
 * Properties a user may see. `all` -> every property; otherwise the explicit
 * `propertyIds`. (For `group` scope, the caller resolves the group's member ids
 * into `propertyIds` before calling — see session-access.ts.)
 */
export function visibleProperties(scope: {
  scopeType: string;
  propertyIds: readonly string[];
}): Property[] {
  if (scope.scopeType === "all") return PROPERTIES;
  return PROPERTIES.filter((p) => scope.propertyIds.includes(p.id));
}
