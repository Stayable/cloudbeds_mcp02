/**
 * Thin client for the Cloudbeds PMS API (v1.2).
 *
 * Auth: self-service API key passed as the `x-api-key` header. OAuth bearer
 * tokens are also supported by setting CLOUDBEDS_ACCESS_TOKEN instead of a key.
 *
 * Docs: https://hotels.cloudbeds.com/api/v1.2/docs/
 * Methods are named operations (getReservations, getGuestList, ...) reached at
 * `${baseUrl}/{method}`. GET params are query-string encoded; POST/PUT bodies
 * are form-encoded. Responses are JSON shaped like { success, data, total, ... }.
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

  /** Strip undefined/null params and coerce values to strings. */
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

  async post<T = unknown>(
    method: string,
    body: Record<string, unknown> = {},
  ): Promise<CloudbedsResponse<T>> {
    const url = `${this.config.baseUrl}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams(this.clean(body)).toString(),
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
      const msg =
        json?.message ?? text?.slice(0, 500) ?? `HTTP ${res.status}`;
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
 * `CLOUDBEDS_API_KEY_<propertyID>` (e.g. CLOUDBEDS_API_KEY_5399). A bare
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
      if (m && value) keys.set(m[1], value);
    }
    return new CloudbedsRegistry(
      baseUrl,
      keys,
      process.env.CLOUDBEDS_API_KEY || undefined,
      process.env.CLOUDBEDS_ACCESS_TOKEN || undefined,
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
    if (!propertyID) {
      if (this.keys.size === 1) {
        return this.clientFor({ apiKey: [...this.keys.values()][0] });
      }
      if (this.keys.size > 1) {
        throw new Error(
          `Multiple property keys configured (${[...this.keys.keys()].join(", ")}). Specify propertyID.`,
        );
      }
    }
    const known = [...this.keys.keys()];
    throw new Error(
      `No Cloudbeds key for property ${propertyID ?? "(unspecified)"}. ` +
        `Configured: ${known.length ? known.join(", ") : "none"}. ` +
        `Set CLOUDBEDS_API_KEY_${propertyID ?? "<propertyID>"} (or CLOUDBEDS_API_KEY).`,
    );
  }

  /** Every configured account, for fan-out calls like list_properties. */
  all(): { id: string; client: CloudbedsClient }[] {
    if (this.keys.size) {
      return [...this.keys].map(([id, key]) => ({
        id,
        client: this.clientFor({ apiKey: key }),
      }));
    }
    if (this.defaultKey) {
      return [{ id: "default", client: this.clientFor({ apiKey: this.defaultKey }) }];
    }
    if (this.accessToken) {
      return [
        { id: "oauth", client: this.clientFor({ accessToken: this.accessToken }) },
      ];
    }
    return [];
  }
}
