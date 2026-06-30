# Design Brief — Stayable Email Templates (full set + OTP redesign)

**For:** Claude design / artifact generation
**Deliverable:** a cohesive set of responsive **HTML emails** (inline CSS, email-client safe),
one per message type below, sharing one visual system. Plus a short **plain-text / SMS**
variant of each guest message (for the Akia channel — see §6).
**Supersedes:** `claude-design-guest-code-notification.md` (that brief covered only the
"code ready" email; this one is the complete set).

Current working templates live in code at `lock-app/src/lib/guest-email.ts` and
`middleware/lib/guest-email.ts` (kept identical) and `lock-app/src/lib/email.ts` (OTP).
Those are functional placeholders — this brief is to make them beautiful and on-brand.
**Keep the same template "kinds" and data variables** so the redesign drops into the code
without logic changes.

---

## 1. Audience & tone

- **Guest emails:** an arriving / in-house / departing extended-stay guest, often tired,
  on a phone. Warm, hospitable, confident, concise. Plain language — say "door code,"
  never "PIN/passcode/keyboardPwd." The **door code** and **room number** are the heroes;
  scannable in 5 seconds.
- **OTP email:** an internal staff/admin user signing in to the lock-app. Tone is crisp,
  secure, utilitarian (not hospitality-warm). The **6-digit code** is the hero.

## 2. Brand system (use these exact tokens — they match the lock-app)

- **Navy** `#041E42` — headers, dark blocks
- **Shell navy** `#08152B` — darkest ink
- **Blue** `#1E8FF2` — primary links / actions
- **Gold** `#FDDA24` — accent hairline / small highlights (sparingly — one per section)
- **Canvas** `#F4F6FA` — page background
- **Muted ink** `#6B7280` / `#8A94A6` — secondary text
- Type: system UI sans for body; a **monospace** face for the code itself
  (each digit slightly letter-spaced, high contrast). A characterful display face for the
  headline is welcome if it stays email-safe (web-font fallbacks must degrade gracefully).
- Layout: single column, **max-width 600px**, centered. Slim navy header bar with the
  **Stayable** wordmark + a thin gold underline. White content card. Mobile-first:
  ≥16px body, generous tap targets, no horizontal scroll. Hero = the code card (white,
  elevated, thin gold top hairline, code in large mono).
- Footer line on every email: "Questions? Just reply to this email and a real person will help."
  (Guest emails are sent from **Stayable &lt;blake@rentstayable.com&gt;**, reply-to the same
  monitored inbox.)

## 3. The templates to design

Each = its own HTML email. Write **final copy**, no lorem. Show realistic sample values.

### A. OTP sign-in code  *(REDESIGN of the existing one)*
- **Who:** staff/admin signing into the lock-app. **From:** Stayable Locks.
- **Hero:** the **6-digit code**, large mono, easy to copy. Label "YOUR SIGN-IN CODE."
- **Copy:** "Enter this code to sign in. It expires in 15 minutes." + a security line:
  "If you didn't request this, you can ignore this email — no one can sign in without the code."
- **Vars:** `{{code}}`.
- Tone: secure/utilitarian, not hospitality. Keep it tight; no door-code/hospitality copy.

### B. Door code ready (check-in)  — kind `generated`
- **Trigger:** guest checked in + paid → PIN created.
- **Headline:** "Welcome, {{guestFirstName}}!" Sub: "Your door code for Room {{roomNumber}}
  at {{propertyName}} is ready."
- **Hero:** `{{doorCode}}`.
- **How to use it (3 steps):** 1) Go to Room {{roomNumber}}. 2) Tap the keypad to wake it.
  3) Enter {{doorCode}}, then press the unlock key.
- **Validity:** "Your stay: {{checkInDate}} – {{checkOutDate}}." + "This code is unique to
  your stay — please don't share it. It stops working automatically at checkout."
- **Help:** "Code not working? Reply to this email."

### C. Door code deactivated  — kind `code_revoked`  *(standalone revoke — safeguard)*
- **Trigger:** an admin **revokes** a guest's code with no replacement (e.g. Revoke pressed
  instead of Rotate). Safeguard email so the guest knows the code stopped working.
- **Copy:** "{{guestFirstName}}, the door code for Room {{roomNumber}} at {{propertyName}}
  has been deactivated and no longer works. If you still need access, please contact the
  front desk or reply to this email and we'll sort it out right away."
- **No code shown.** No promise of a follow-up (none is guaranteed). Calm, not alarming.
  Vars: `{{guestFirstName}}`, `{{roomNumber}}`, `{{propertyName}}`.
- *(After such a revoke, generating a new code sends template B — "generated".)*

### D. New door code on room change  — kind `room_changed`
- **Trigger:** guest moved to a different room → new PIN on the new room.
- **Headline:** "Thanks for your patience, {{guestFirstName}}." Sub: "You've been moved to
  Room {{roomNumber}} at {{propertyName}}. Here is your new door code."
- **Hero:** `{{doorCode}}`. Note: "Your previous room's code no longer works."
- Same how-to + validity + help as B. Vars: same as B.

### E. Door code rotated/updated  — kind `updated`  *(the Rotate flow)*
- **Trigger:** an admin **rotates** a guest's code (Resend) — the old code is revoked and a
  new one issued in one action → ONE email.
- **Copy:** "Your door code for Room {{roomNumber}} at {{propertyName}} has been updated.
  Please use the new code below. Any previous code no longer works." Hero: `{{doorCode}}`.
  Same how-to + help as B. Vars: same as B.

### F. Thank-you at checkout  — kind `revoked`
- **Trigger:** stay ended (checkout) → code deactivated.
- **Copy:** "Thank you, {{guestFirstName}}. We hope you enjoyed your stay in Room
  {{roomNumber}} at {{propertyName}}. Your door code has now been deactivated as your stay
  has ended. It was a pleasure hosting you — we'd love to welcome you back anytime. Safe
  travels!" **No code shown.** Warm, gracious close. Vars: `{{guestFirstName}}`,
  `{{roomNumber}}`, `{{propertyName}}`.

## 4. Template variables (provide all as placeholders)

| Variable | Example | Used in |
|----------|---------|---------|
| `{{code}}` | 482915 | A (OTP) |
| `{{guestFirstName}}` | Alexander (fallback "Guest") | B,C,D,E,F |
| `{{propertyName}}` | Stayable Lakeland | B,C,D,E,F |
| `{{roomNumber}}` | 239 (human number, never internal roomID) | B,C,D,E,F |
| `{{doorCode}}` | 794490 (4-digit) | B,D,E |
| `{{checkInDate}}` / `{{checkOutDate}}` | Jun 25, 2026 | B,D,E |

## 5. Build constraints
- Inline CSS only; table-based layout for client compatibility; no external fonts/images
  that could be blocked (embed or use system/mono stacks). Include a hidden **preheader**
  line per email. Test mental-model: Gmail, Outlook, Apple Mail, iOS.

## 6. Akia channel — sample message templates (SMS + email)

Stayable will send guest door-code messages **via Akia** (existing guest-messaging
platform) rather than a direct SMS provider — Akia owns SMS compliance/opt-in. Provide
short templates Akia can paste into its template editor. Akia merge-field syntax should be
confirmed with Akia; below uses `{{ }}` placeholders — swap to Akia's tokens
(e.g. it may expose `{{guest.first_name}}`, `{{reservation.room}}`).

**SMS — door code ready (check-in):**
```
Hi {{guestFirstName}}, welcome to {{propertyName}}! Your door code for Room
{{roomNumber}} is {{doorCode}}. Tap the keypad, enter the code, press unlock.
It works through checkout. Reply here if you need help. — Stayable
```

**SMS — new code on room change:**
```
{{guestFirstName}}, thanks for your patience. You've moved to Room {{roomNumber}}
at {{propertyName}}. Your NEW door code is {{doorCode}} (your old code no longer
works). Reply here with any questions. — Stayable
```

**SMS — checkout thank-you:**
```
Thank you for staying with us at {{propertyName}}, {{guestFirstName}}! Your door
code is now deactivated. Safe travels — we'd love to host you again. — Stayable
```

**Email (if Akia sends email too):** reuse templates B / D / F above — same copy,
same Stayable branding, sender/reply-to blake@rentstayable.com.

**Data Stayable can hand Akia per message:** `guestFirstName`, `propertyName`,
`roomNumber` (human), `doorCode`, `checkInDate`, `checkOutDate`, plus the `reservationID`
for matching. (Open question for Akia: can it template off a Cloudbeds reservation
note/custom field we already write — `<lock>-<PIN>` — so no new feed is needed? Ask first.)
