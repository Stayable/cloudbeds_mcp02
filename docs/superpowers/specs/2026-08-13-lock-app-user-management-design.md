# lock-app — User management page (design)

Date: 2026-08-13 · Status: approved (BK)

## Problem

lock-app has seven users, all `super_admin` with `all` scope, and **no UI to manage
them**. Every change today is a code edit (`prisma/seed-users.ts`) plus a manual
`npm run db:seed:users` against prod Neon. There is no way to remove access when
someone leaves, no way to scope a user to their property, and no audit record of
who granted what.

The RBAC layer already anticipated this page — `users.view` and `users.manage` are
in the permission catalog (`src/lib/permissions.ts`), `super_admin` holds both,
`manager` and `attendant` hold `users.view` only (`prisma/seed.ts`). The page was
simply never built.

## Auth model (context that shapes everything below)

lock-app is **OTP-only — no passwords are stored**. Login mints a 6-digit code
(`lib/auth.ts` `createOtp`) *only* for an email that already exists in the `User`
table, and emails it via Resend. Therefore:

- **"Add user" and "invite" are the same action.** A `User` row *is* login access.
- **"Change password" does not exist.** Its operational equivalent is
  **Reset access**: revoke the user's sessions and invalidate pending codes so
  their next sign-in is a fresh OTP.

Decision (BK): stay OTP-only. No password column, no second credential.

## Scope

In: add/invite, edit name + role + property scope, reset access, disable/enable,
archive/restore, welcome email, audit rows, sidebar entry.
Out: custom role editing (`roles.manage`, the role list stays the three seeded
roles), group scope (`scopeType: "group"` remains unused), password auth, SSO.

## 1. Data model

Three nullable columns on `User` in `lock-app/prisma/schema.prisma`. `User` is a
lock-app-only table (under `// ---------- LOCK-APP OWN TABLES ----------`), so
there is **no middleware schema to mirror** — unlike `Passcode` / `AppSettings`.

| Column | Meaning |
|---|---|
| `disabledAt DateTime?` | non-null = locked out now, reversible, row visible |
| `archivedAt DateTime?` | non-null = "deleted": hidden from the default list, row retained so Activity can still resolve the actor |
| `lastLoginAt DateTime?` | set on successful OTP verify; drives the "invited, never signed in" status |

Delete is an archive, per BK. Nothing about a user is ever destroyed, so the
EventLog audit trail stays resolvable.

## 2. Auth enforcement

A flag column locks nobody out on its own. Both auth paths in `lib/auth.ts` must
honor it, and the disable action must terminate what is already live:

- **`createOtp`** — refuse to mint for a disabled or archived user, returning
  silently exactly as it does for an unknown email. Same shape = no account
  enumeration leak.
- **`getSession`** — return `null` when the session's user is disabled or
  archived. This is what boots an *already signed-in* user on their next request
  instead of waiting for their 8-hour JWT to lapse.
- **`verifyOtp`** — set `lastLoginAt` on success.
- **Disable / archive / reset-access actions** — delete the user's `Session` rows
  and mark their unused `MagicLink` rows used, so lockout is immediate rather
  than eventual.

Reset access is that last bullet *without* setting a flag: kill sessions,
invalidate pending codes, user stays active and signs in fresh.

## 3. Pure logic — `src/lib/user-admin.ts` (TDD)

Same shape as `zones.ts` / `code-naming.ts` / `lockStatusFrom`: pure functions,
unit-tested, no Prisma import.

- `userStatus(user, now)` → `"active" | "disabled" | "archived" | "invited"`
  (`invited` = active but `lastLoginAt` null — the invite may not have landed)
- `normalizeEmail(raw)` → trimmed + lowercased
- `isValidEmail(raw)` → boolean
- `scopeSummary(user, properties)` → `"All properties"` or `"Lakeland, Kissimmee East"`
- `canManageUser(actor, target, allUsers)` → `{ ok: true } | { ok: false; reason }`

`canManageUser` holds the two safety rails:

1. **No self-harm.** You cannot disable, archive, or change the role/scope of your
   own account — an admin cannot lock themselves out. (Editing your own *name* is
   fine.)
2. **Never zero admins.** The last active `super_admin` cannot be disabled,
   archived, or demoted. Without this, one action can lock every user out of the
   app permanently, since there is no console fallback.

## 4. Page and actions

`/users` — global, beside `/settings`, following that page's exact pattern
(`requireUserOrRedirect` → `sessionCan` → `<Forbidden>`).

- `users.view` renders the roster read-only (so managers and attendants can see
  who has access); `users.manage` reveals the mutating controls.
- Columns: Name · Email · Role · Scope · Status · Last sign-in · actions.
- Archived users sit behind a "Show archived" toggle and can be restored.

Server actions in `src/app/(app)/users/actions.ts`, each returning `ActionResult`
(`lib/action-result.ts`) and driven by the existing `<ActionButton>` /
`<ActionForm>` components, so a failure surfaces in the dismissible modal rather
than crashing the route:

| Action | Notes |
|---|---|
| `addUser` | email + name + role + scope; sends the welcome email |
| `updateUser` | name, role, scope |
| `resetAccess` | revoke sessions + pending codes |
| `setUserDisabled` | disable / enable |
| `setUserArchived` | archive / restore |
| `resendInvite` | re-send the welcome email |

Every action writes an `EventLog` row via `writeAudit` (`lib/audit-write.ts`) with
`source: "admin"`: `user_added`, `user_updated`, `user_disabled`, `user_enabled`,
`user_archived`, `user_restored`, `user_access_reset`, `user_invited`. This is
what makes admin actions auditable — the standing concern about the shared
`admin@rentstayable.com` mailbox collapsing attribution.

`writeAudit` currently requires a `propertyId`. User administration is
portfolio-wide, so `propertyId` becomes optional there (`EventLog.propertyId` is
already nullable). Small, contained change; existing callers are unaffected.

## 5. Welcome email

`src/lib/user-invite-email.ts`, a pure `buildInviteEmail()` plus a thin
`sendInviteEmail()`, reusing `emailShell` from `lib/guest-email.ts` exactly as
`lib/email.ts` does for the OTP — so the invite matches the Stayable email system
shipped 2026-07-01 (navy header, hosted logo, gold hairline).

Content: you have access to Stayable Locks, here is the link, sign in with this
email address and we email you a 6-digit code — no password to remember.

Delivery is best-effort, like `sendOtpEmail`: a failure logs `user_invite_failed`
and never blocks or rolls back the user creation. The row is what grants access;
the email is a courtesy.

## 6. Sidebar

A "Users" entry under Fleet beside Settings, gated on a `canUsers` prop mirroring
the existing `canSettings` (`components/Sidebar.tsx`, wired in `(app)/layout.tsx`).

## 7. Testing and verification

- Vitest over `user-admin.ts`: status derivation, both safety rails, email
  normalization/validation, scope summary.
- Vitest over `buildInviteEmail`: subject and the sign-in link.
- `npm test`, `npx tsc --noEmit`, `npm run build` all green.
- `npx prisma db push` against prod Neon (additive nullable columns only —
  no data loss, no downtime).
- Live, after deploy: add a throwaway user → confirm the invite email arrives and
  they can request a code; disable them → confirm OTP is refused and any live
  session is booted; scope a user to one property → confirm their sidebar and
  portfolio show only that property; archive → confirm they leave the list and
  the Activity log still names them.

## Follow-on (not this build)

With the page live, the standing user-hygiene items become UI work rather than
code changes: scope Gerardo and Crystal down from `super_admin`, replace the
placeholder display names, and decide whether the shared `admin@rentstayable.com`
mailbox keeps full admin.
