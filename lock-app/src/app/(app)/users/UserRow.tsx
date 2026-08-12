"use client";
import { useState } from "react";
import ActionButton from "@/components/ActionButton";
import ActionForm from "@/components/ActionForm";
import ScopeFields, { type PropertyOption } from "./ScopeFields";
import { updateUser, setUserDisabled, setUserArchived, resetAccess, resendInvite } from "./actions";

export interface UserRowData {
  id: string;
  name: string;
  email: string;
  roleName: string;
  scopeType: string;
  propertyIds: string[];
  scopeText: string;
  status: string;
  statusClass: string;
  statusLabel: string;
  lastLogin: string;
  isSelf: boolean;
}

const GRID = "1.6fr 1fr 1.4fr .9fr .9fr auto";

/** One roster row, expanding into an inline edit form. */
export default function UserRow({
  user,
  canManage,
  roleNames,
  properties,
}: {
  user: UserRowData;
  canManage: boolean;
  roleNames: string[];
  properties: PropertyOption[];
}) {
  const [editing, setEditing] = useState(false);
  const archived = user.status === "archived";
  const disabled = user.status === "disabled";

  return (
    <div className="trow" style={{ display: "block", opacity: archived ? 0.62 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.name}
            {user.isSelf && <span className="chip chip-ok" style={{ marginLeft: 8 }}>YOU</span>}
          </div>
          <div className="subtle" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
        </div>
        <div style={{ fontSize: 13 }}>{user.roleName}</div>
        <div className="subtle" style={{ fontSize: 13 }}>{user.scopeText}</div>
        <div>
          <span className={user.statusClass}><span className="dot" />{user.statusLabel}</span>
        </div>
        <div className="subtle" style={{ fontSize: 13 }}>{user.lastLogin}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {canManage && !archived && (
            <button type="button" className="btn btn-ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close" : "Edit"}
            </button>
          )}
          {canManage && archived && (
            <ActionButton
              action={() => setUserArchived(user.id, false)}
              label="Restore"
              className="btn btn-ghost"
              pendingLabel="Restoring…"
            />
          )}
        </div>
      </div>

      {editing && canManage && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
          <ActionForm action={updateUser} loadingLabel="Saving user…">
            <input type="hidden" name="userId" value={user.id} />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="lbl" htmlFor={`n-${user.id}`}>FULL NAME</label>
                <input id={`n-${user.id}`} name="name" required defaultValue={user.name} className="field" style={{ width: "100%", height: 44 }} />
              </div>
              <ScopeFields
                roleNames={roleNames}
                properties={properties}
                defaultRole={user.roleName}
                defaultScopeType={user.scopeType}
                defaultPropertyIds={user.propertyIds}
                idPrefix={`e-${user.id}`}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" style={{ height: 42 }}>Save changes</button>
            </div>
          </ActionForm>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
            <ActionButton
              action={() => resendInvite(user.id)}
              label="Resend invite"
              className="btn btn-ghost"
              pendingLabel="Sending…"
            />
            <ActionButton
              action={() => resetAccess(user.id)}
              label="Reset access"
              className="btn btn-ghost"
              pendingLabel="Resetting…"
              confirm={`Sign ${user.name} out everywhere and cancel any unused sign-in code? They'll need a fresh code to get back in.`}
            />
            <ActionButton
              action={() => setUserDisabled(user.id, !disabled)}
              label={disabled ? "Enable" : "Disable"}
              className="btn btn-ghost"
              pendingLabel="Working…"
              confirm={
                disabled
                  ? undefined
                  : `Disable ${user.name}? They'll be signed out immediately and can't sign back in until you enable them.`
              }
            />
            <ActionButton
              action={() => setUserArchived(user.id, true)}
              label="Delete"
              className="btn btn-danger"
              pendingLabel="Deleting…"
              confirm={`Delete ${user.name}? Their access ends immediately. The record is kept so the Activity log still shows what they did, and you can restore them later.`}
            />
          </div>
          <p className="subtle" style={{ fontSize: 11, marginTop: 10 }}>
            Reset access = the password-reset equivalent here: it ends their sessions and cancels unused
            codes, but leaves the account active.
          </p>
        </div>
      )}
    </div>
  );
}
