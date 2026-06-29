/**
 * Minimal read-only Cloudbeds PMS API client (v1.2) + per-property key registry —
 * lock-app copy. Used only to resolve a human room NUMBER (e.g. "292") to the
 * Cloudbeds roomID (e.g. "405758-102") at onboarding/assign time, so LockMap is
 * keyed by the same roomID the check-in webhook matches on.
 *
 * This mirrors the registry in `middleware/lib/cloudbeds.ts` and the MCP clients.
 * Vercel can't import across sibling project folders, so each app carries its own
 * copy — keep the registry behavior in sync. Stayable's 8 properties are 8 SEPARATE
 * Cloudbeds accounts, so each needs its own `CLOUDBEDS_API_KEY_<propertyID>`.
 *
 * NOTE: the lock-app Vercel project must have the per-property keys set (read
 * scope is enough). Without a key for a property, resolution is skipped (the
 * caller keeps the existing mapping rather than writing a wrong one).
 */

export interface CloudbedsResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  total?: number;
  count?: number;
  [key: string]: unknown;
}

export class CloudbedsClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async get<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CloudbedsResponse<T>> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      clean[k] = typeof v === "string" ? v : String(v);
    }
    const qs = new URLSearchParams(clean).toString();
    const url = `${this.baseUrl}/${method}${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(6000),
    });
    const text = await res.text();
    let json: CloudbedsResponse<T> | undefined;
    try {
      json = text ? (JSON.parse(text) as CloudbedsResponse<T>) : undefined;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      throw new Error(json?.message ?? text?.slice(0, 300) ?? `Cloudbeds HTTP ${res.status}`);
    }
    if (json && json.success === false) {
      throw new Error(json.message ?? "Cloudbeds returned success=false");
    }
    return json ?? ({ success: true } as CloudbedsResponse<T>);
  }

  /** Form-encoded POST (write). The lock-app keys carry Reservation R+W scope. */
  async post<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CloudbedsResponse<T>> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      clean[k] = typeof v === "string" ? v : String(v);
    }
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-api-key": this.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(clean).toString(),
      signal: AbortSignal.timeout(6000),
    });
    const text = await res.text();
    let json: CloudbedsResponse<T> | undefined;
    try {
      json = text ? (JSON.parse(text) as CloudbedsResponse<T>) : undefined;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      throw new Error(json?.message ?? text?.slice(0, 300) ?? `Cloudbeds HTTP ${res.status}`);
    }
    if (json && json.success === false) {
      throw new Error(json.message ?? "Cloudbeds returned success=false");
    }
    return json ?? ({ success: true } as CloudbedsResponse<T>);
  }
}

/** Routes each call to the right per-property API key. */
export class CloudbedsRegistry {
  private constructor(
    private readonly baseUrl: string,
    private readonly keys: Map<string, string>,
  ) {}

  static fromEnv(): CloudbedsRegistry {
    const baseUrl = (
      process.env.CLOUDBEDS_BASE_URL ?? "https://api.cloudbeds.com/api/v1.2"
    ).replace(/\/$/, "");
    const keys = new Map<string, string>();
    for (const [name, value] of Object.entries(process.env)) {
      const m = /^CLOUDBEDS_API_KEY_(.+)$/.exec(name);
      if (m && value) keys.set(m[1], value.trim());
    }
    const fallback = process.env.CLOUDBEDS_API_KEY?.trim();
    if (fallback) keys.set("__default__", fallback);
    return new CloudbedsRegistry(baseUrl, keys);
  }

  /** True if a key is configured for this property (or a bare fallback exists). */
  has(propertyId: string): boolean {
    return this.keys.has(propertyId) || this.keys.has("__default__");
  }

  /** The client for a property, or null if no key is configured for it. */
  resolve(propertyId: string): CloudbedsClient | null {
    const key = this.keys.get(propertyId) ?? this.keys.get("__default__");
    return key ? new CloudbedsClient(key, this.baseUrl) : null;
  }
}

export interface CloudbedsRoom {
  roomID: string;
  roomName: string;
}

/**
 * List every physical room for a property (paginated getRooms), returning just
 * the (roomID, roomName) pairs needed to resolve a room number → roomID. Returns
 * null if no Cloudbeds key is configured for the property (caller skips, doesn't
 * overwrite). getRooms returns `data[].rooms[]` and takes `propertyIDs` (plural).
 */
export async function listRooms(
  registry: CloudbedsRegistry,
  propertyId: string,
): Promise<CloudbedsRoom[] | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;

  const out: CloudbedsRoom[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await client.get<Array<{ rooms?: Array<{ roomID?: unknown; roomName?: unknown }> }>>(
      "getRooms",
      { propertyIDs: propertyId, pageNumber: page, pageSize: 100 },
    );
    const rows = (res.data ?? []).flatMap((d) => d.rooms ?? []);
    for (const r of rows) {
      if (r?.roomID != null) {
        out.push({ roomID: String(r.roomID), roomName: String(r.roomName ?? "").trim() });
      }
    }
    if (rows.length < 100) break; // last page
  }
  return out;
}

/** A single assigned room within a reservation (Cloudbeds getReservation). */
export interface ReservationRoom {
  roomID?: string;
  roomName?: string;
  [k: string]: unknown;
}

/** Minimal reservation shape the room detail page needs (name + lease dates;
 *  Cloudbeds sometimes includes primary-guest contact + guestID here). */
export interface ReservationDetail {
  reservationID?: string | number;
  status?: string;
  guestName?: string;
  guestID?: string | number;
  startDate?: string;
  endDate?: string;
  email?: string;        // legacy/defensive
  phone?: string;        // legacy/defensive
  guestEmail?: string;   // Cloudbeds actual
  guestPhone?: string;   // Cloudbeds actual
  // room assignment can appear under any of these depending on endpoint/account
  assigned?: ReservationRoom[];
  rooms?: ReservationRoom[];
  guestList?: Record<string, { roomID?: string; rooms?: ReservationRoom[]; [k: string]: unknown }> | null;
  [k: string]: unknown;
}

/** Every room object referenced by a reservation, across the shapes Cloudbeds uses. */
function allReservationRooms(detail: ReservationDetail): ReservationRoom[] {
  const out: ReservationRoom[] = [];
  if (Array.isArray(detail.assigned)) out.push(...detail.assigned);
  if (Array.isArray(detail.rooms)) out.push(...detail.rooms);
  if (detail.guestList) {
    for (const g of Object.values(detail.guestList)) {
      if (g?.roomID) out.push({ roomID: g.roomID });
      if (Array.isArray(g?.rooms)) out.push(...g.rooms);
    }
  }
  return out;
}

/** Distinct assigned roomIDs for a reservation (deduped, blanks skipped). */
export function extractRoomIds(detail: ReservationDetail): string[] {
  const ids = allReservationRooms(detail)
    .map((r) => (r?.roomID != null ? String(r.roomID).trim() : ""))
    .filter((id) => id.length > 0);
  return [...new Set(ids)];
}

/** Human room name (e.g. "239") for a roomID within a reservation, if present. */
export function roomNameFor(detail: ReservationDetail, roomId: string): string | null {
  const match = allReservationRooms(detail).find((r) => String(r?.roomID ?? "").trim() === roomId);
  const name = match?.roomName != null ? String(match.roomName).trim() : "";
  return name.length > 0 ? name : null;
}

/**
 * List the property's currently checked-in reservations (Cloudbeds getReservations,
 * status=checked_in), paginated. Returns null if no key for the property. Rows may
 * or may not carry room assignments depending on the account — the caller falls
 * back to getReservation() per row when needed.
 */
export async function listCheckedInReservations(
  registry: CloudbedsRegistry,
  propertyId: string,
): Promise<ReservationDetail[] | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;

  const out: ReservationDetail[] = [];
  for (let page = 1; page <= 50; page++) {
    // includeGuestsDetails returns each reservation's guestList/rooms inline, so
    // we can read the assigned room from the LIST row and avoid a getReservation
    // call per reservation (which is what tripped Cloudbeds' rate limit).
    const res = await client.get<ReservationDetail[]>("getReservations", {
      propertyID: propertyId, status: "checked_in", includeGuestsDetails: true,
      pageNumber: page, pageSize: 100,
    });
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break; // last page
  }
  return out;
}

/** Minimal guest record — contact fields only. */
export interface GuestRecord {
  email?: string;
  phone?: string;
  cellPhone?: string;
  guestEmail?: string;      // Cloudbeds actual
  guestPhone?: string;      // Cloudbeds actual
  guestCellPhone?: string;  // Cloudbeds actual
  [k: string]: unknown;
}

/** Fetch one reservation's detail (name, lease dates, primary guest). Returns
 *  null if no Cloudbeds key is configured for the property. */
export async function getReservation(
  registry: CloudbedsRegistry,
  propertyId: string,
  reservationId: string,
): Promise<ReservationDetail | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;
  const res = await client.get<ReservationDetail>("getReservation", {
    propertyID: propertyId,
    reservationID: reservationId,
  });
  return (res.data ?? {}) as ReservationDetail;
}

/** Post a note onto a Cloudbeds reservation (e.g. the door-code token). Mirrors
 *  middleware's postReservationNote. No-ops if no key for the property. */
export async function postReservationNote(
  registry: CloudbedsRegistry,
  propertyId: string,
  reservationId: string,
  note: string,
): Promise<void> {
  const client = registry.resolve(propertyId);
  if (!client) return;
  await client.post("postReservationNote", {
    propertyID: propertyId,
    reservationID: reservationId,
    reservationNote: note,
  });
}

/** Fetch one guest's contact record. Returns null if no key for the property. */
export async function getGuest(
  registry: CloudbedsRegistry,
  propertyId: string,
  guestId: string,
): Promise<GuestRecord | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;
  const res = await client.get<GuestRecord>("getGuest", {
    propertyID: propertyId,
    guestID: guestId,
  });
  return (res.data ?? {}) as GuestRecord;
}
