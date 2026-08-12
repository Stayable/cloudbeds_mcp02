"use client";
import { useState } from "react";

export interface PropertyOption { id: string; name: string; abbr: string }

/**
 * Role select + property-scope picker, shared by the add and edit forms.
 * "All properties" hides the checkbox list; picking specific properties reveals
 * it. Names match the server action's FormData keys (roleName / scopeType /
 * propertyIds).
 */
export default function ScopeFields({
  roleNames,
  properties,
  defaultRole,
  defaultScopeType,
  defaultPropertyIds,
  idPrefix,
}: {
  roleNames: string[];
  properties: PropertyOption[];
  defaultRole: string;
  defaultScopeType: string;
  defaultPropertyIds: string[];
  idPrefix: string;
}) {
  const [scopeType, setScopeType] = useState(defaultScopeType === "all" ? "all" : "property");

  return (
    <>
      <div style={{ minWidth: 170 }}>
        <label className="lbl" htmlFor={`${idPrefix}-role`}>ROLE</label>
        <select
          id={`${idPrefix}-role`} name="roleName" defaultValue={defaultRole}
          className="field" style={{ width: "100%", height: 44 }}
        >
          {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ minWidth: 190 }}>
        <label className="lbl" htmlFor={`${idPrefix}-scope`}>ACCESS</label>
        <select
          id={`${idPrefix}-scope`} name="scopeType" value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
          className="field" style={{ width: "100%", height: 44 }}
        >
          <option value="all">All properties</option>
          <option value="property">Specific properties…</option>
        </select>
      </div>

      {scopeType === "property" && (
        <div style={{ flexBasis: "100%" }}>
          <label className="lbl">PROPERTIES</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {properties.map((p) => (
              <label
                key={p.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13,
                  border: "1px solid var(--line-2)", borderRadius: 8, padding: "8px 12px",
                  background: "var(--surface)", cursor: "pointer",
                }}
              >
                <input type="checkbox" name="propertyIds" value={p.id} defaultChecked={defaultPropertyIds.includes(p.id)} />
                <span style={{ fontWeight: 600 }}>{p.abbr}</span>
                <span className="subtle">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
