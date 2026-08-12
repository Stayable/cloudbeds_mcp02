"use client";
import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { addUser } from "./actions";
import ScopeFields, { type PropertyOption } from "./ScopeFields";

/** Collapsed "Add user" card — expands into the invite form. */
export default function AddUserCard({
  roleNames,
  properties,
}: {
  roleNames: string[];
  properties: PropertyOption[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-navy" onClick={() => setOpen(true)}>
        + Add user
      </button>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 6 }}>Add a user</div>
      <p className="subtle" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 18 }}>
        Creating the user grants access immediately and emails them a welcome message. They sign in with
        this address — a 6-digit code is emailed each time, so there&apos;s no password to set.
      </p>

      <ActionForm action={addUser} loadingLabel="Adding user…">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="lbl" htmlFor="add-name">FULL NAME</label>
            <input id="add-name" name="name" required placeholder="Gerardo Ruiz" className="field" style={{ width: "100%", height: 44 }} />
          </div>
          <div style={{ flex: 1, minWidth: 230 }}>
            <label className="lbl" htmlFor="add-email">WORK EMAIL</label>
            <input id="add-email" name="email" type="email" required placeholder="name@rentstayable.com" className="field" style={{ width: "100%", height: 44 }} />
          </div>
          <ScopeFields
            roleNames={roleNames}
            properties={properties}
            defaultRole={roleNames.includes("attendant") ? "attendant" : roleNames[0]}
            defaultScopeType="property"
            defaultPropertyIds={[]}
            idPrefix="add"
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="submit" className="btn btn-primary" style={{ height: 44 }}>Add user &amp; send invite</button>
          <button type="button" className="btn btn-ghost" style={{ height: 44 }} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </ActionForm>
    </div>
  );
}
