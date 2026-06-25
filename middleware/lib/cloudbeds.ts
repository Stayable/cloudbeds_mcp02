/**
 * Thin Cloudbeds PMS API client (v1.2) + per-property key registry.
 *
 * This is a THIRD copy of the same client/registry that lives in
 * `cloudbeds-mcp/src/client.ts` and `cloudbeds-mcp-server/lib/cloudbeds.ts`.
 * Vercel deploys a single root directory and cannot import across sibling
 * folders, so — like the MCP pair — the middleware carries its own copy. Keep
 * the client/registry behavior in sync with those if it ever changes.
 *
 * Why the middleware needs Cloudbeds at all: the webhook payload is THIN and
 * carries NO roomID. To know which door(s) a reservation occupies we must call
 * getReservation(propertyID, reservationID) and read the assigned rooms. And
 * because Stayable's 8 properties are 8 SEPARATE Cloudbeds accounts, we need the
 * 8-key registry (one `CLOUDBEDS_API_KEY_<propertyID>` each), not a single token.
 */

export interface CloudbedsConfig {
  apiKey?: string;
  accessToken?: string;
  baseUrl: string;
}

export interface CloudbedsResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  total?: number;
  count?: number;
  [key: string]: unknown;
}

export class CloudbedsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly requestId?: string | null,
  ) {
    super(message);
    this.name = "CloudbedsError";
  }
}

export class CloudbedsClient {
  constructor(private readonly config: CloudbedsConfig) {
    if (!config.apiKey && !config.accessToken) {
      throw new Error(
        "Cloudbeds auth missing: set CLOUDBEDS_API_KEY or CLOUDBEDS_ACCESS_TOKEN",
      );
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json", ...extra };
    if (this.config.accessToken) {
      h["Authorization"] = `Bearer ${this.config.accessToken}`;
    } else if (this.config.apiKey) {
      h["x-api-key"] = this.config.apiKey;
    }
    return h;
  }

  /** Strip undefined/null/empty params and coerce values to strings. */
  private clean(params: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    return out;
  }

  async get<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CloudbedsResponse<T>> {
    const qs = new URLSearchParams(this.clean(params)).toString();
    const url = `${this.config.baseUrl}/${method}${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { method: "GET", headers: this.headers() });
    return this.parse<T>(res);
  }

  /** Form-encoded POST (Cloudbeds write endpoints, e.g. postReservationNote). */
  async post<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CloudbedsResponse<T>> {
    const url = `${this.config.baseUrl}/${method}`;
    const body = new URLSearchParams(this.clean(params)).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body,
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<CloudbedsResponse<T>> {
    const requestId = res.headers.get("x-request-id");
    const text = await res.text();
    let json: CloudbedsResponse<T> | undefined;
    try {
      json = text ? (JSON.parse(text) as CloudbedsResponse<T>) : undefined;
    } catch {
      // non-JSON body (e.g. an HTML error page)
    }

    if (!res.ok) {
      const msg = json?.message ?? text?.slice(0, 500) ?? `HTTP ${res.status}`;
      throw new CloudbedsError(msg, res.status, requestId);
    }
    if (json && json.success === false) {
      throw new CloudbedsError(
        json.message ?? "Cloudbeds returned success=false",
        res.status,
        requestId,
      );
    }
    return json ?? ({ success: true } as CloudbedsResponse<T>);
  }
}

/**
 * Routes each call to the right API key. Stayable's 8 properties are separate
 * Cloudbeds accounts, so each has its own property-level key. Configure them as
 * `CLOUDBEDS_API_KEY_<propertyID>` (e.g. CLOUDBEDS_API_KEY_210972). A bare
 * `CLOUDBEDS_API_KEY` (or `CLOUDBEDS_ACCESS_TOKEN`) acts as a fallback/default.
 */
export class CloudbedsRegistry {
  private constructor(
    private readonly baseUrl: string,
    private readonly keys: Map<string, string>,
    private readonly defaultKey?: string,
    private readonly accessToken?: string,
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
    return new CloudbedsRegistry(
      baseUrl,
      keys,
      process.env.CLOUDBEDS_API_KEY?.trim() || undefined,
      process.env.CLOUDBEDS_ACCESS_TOKEN?.trim() || undefined,
    );
  }

  private clientFor(opts: { apiKey?: string; accessToken?: string }) {
    return new CloudbedsClient({ ...opts, baseUrl: this.baseUrl });
  }

  /** Pick the client for a given property, or throw a helpful error. */
  resolve(propertyID?: string): CloudbedsClient {
    if (propertyID && this.keys.has(propertyID)) {
      return this.clientFor({ apiKey: this.keys.get(propertyID)! });
    }
    if (this.accessToken) return this.clientFor({ accessToken: this.accessToken });
    if (this.defaultKey) return this.clientFor({ apiKey: this.defaultKey });
    if (!propertyID && this.keys.size === 1) {
      return this.clientFor({ apiKey: [...this.keys.values()][0] });
    }
    const known = [...this.keys.keys()];
    throw new Error(
      `No Cloudbeds key for property ${propertyID ?? "(unspecified)"}. ` +
        `Configured: ${known.length ? known.join(", ") : "none"}. ` +
        `Set CLOUDBEDS_API_KEY_${propertyID ?? "<propertyID>"} (or CLOUDBEDS_API_KEY).`,
    );
  }
}

/** A single assigned room within a reservation (Cloudbeds getReservation). */
export interface ReservationRoom {
  roomID?: string;
  roomName?: string;
  roomTypeID?: string;
  roomTypeName?: string;
  startDate?: string;
  endDate?: string;
}

export interface ReservationDetail {
  reservationID?: string;
  propertyID?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  guestName?: string;
  balance?: number | string; // amount still owed; 0 (or credit) = paid in full
  rooms?: ReservationRoom[];
  [key: string]: unknown;
}

/**
 * Fetch a single reservation's full detail. The webhook gives us only
 * (propertyID, reservationID); this is how we discover the assigned room(s).
 */
export async function getReservation(
  registry: CloudbedsRegistry,
  propertyID: string,
  reservationID: string,
): Promise<ReservationDetail> {
  const res = await registry
    .resolve(propertyID)
    .get<ReservationDetail>("getReservation", { propertyID, reservationID });
  return (res.data ?? {}) as ReservationDetail;
}

/**
 * Pull the distinct assigned roomIDs out of a reservation. A reservation can
 * span multiple rooms → multiple PINs. Cloudbeds v1.2 returns assigned rooms
 * under `data.rooms[].roomID`; we read defensively in case the shape varies and
 * skip blanks so an unassigned reservation yields an empty list (logged, not
 * erroring) rather than a bad PIN.
 */
export function extractRoomIds(detail: ReservationDetail): string[] {
  const rooms = Array.isArray(detail.rooms) ? detail.rooms : [];
  const ids = rooms
    .map((r) => (r?.roomID != null ? String(r.roomID).trim() : ""))
    .filter((id) => id.length > 0);
  return [...new Set(ids)];
}

/** Human room name (e.g. "239") for a Cloudbeds roomID, if the detail has it. */
export function roomNameFor(detail: ReservationDetail, roomId: string): string | undefined {
  const rooms = Array.isArray(detail.rooms) ? detail.rooms : [];
  const match = rooms.find((r) => String(r?.roomID ?? "").trim() === roomId);
  return match?.roomName;
}

/**
 * Post a note onto a Cloudbeds reservation (WRITE — needs write:reservation).
 * Used to surface the guest door code on the reservation. Cloudbeds expects the
 * note text under `reservationNote` (not `note`).
 */
export async function postReservationNote(
  registry: CloudbedsRegistry,
  propertyID: string,
  reservationID: string,
  note: string,
): Promise<void> {
  await registry
    .resolve(propertyID)
    .post("postReservationNote", { propertyID, reservationID, reservationNote: note });
}
