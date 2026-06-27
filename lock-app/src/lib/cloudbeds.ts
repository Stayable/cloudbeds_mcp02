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

/** Minimal reservation shape the room detail page needs (name + lease dates;
 *  Cloudbeds sometimes includes primary-guest contact + guestID here). */
export interface ReservationDetail {
  guestName?: string;
  guestID?: string | number;
  startDate?: string;
  endDate?: string;
  email?: string;
  phone?: string;
  [k: string]: unknown;
}

/** Minimal guest record — contact fields only. */
export interface GuestRecord {
  email?: string;
  phone?: string;
  cellPhone?: string;
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
