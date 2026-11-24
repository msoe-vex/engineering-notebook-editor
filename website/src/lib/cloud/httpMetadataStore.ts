import type {
  MetadataDoc,
  MetadataQueryOpts,
  MetadataBatchOp,
  MetadataStore,
} from "@engineering-notebook/shared";

function getCoreUrl(): string {
  const url =
    process.env.CORE_API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    "http://127.0.0.1:8080";
  return url.replace(/\/$/, "");
}

function getInternalSecret(): string {
  return process.env.INTERNAL_SERVICE_SECRET || "local-dev-secret";
}

/**
 * HttpMetadataStore
 * Completely decouples the Next.js frontend from any concrete database implementation.
 * All persistence operations flow cleanly through the Core service via its internal metadata API.
 */
export class HttpMetadataStore implements MetadataStore {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl?: string, secret?: string) {
    this.baseUrl = baseUrl || getCoreUrl();
    this.secret = secret || getInternalSecret();
  }

  private headers(includeJson = true): Record<string, string> {
    const h: Record<string, string> = {
      "x-internal-secret": this.secret,
    };
    if (includeJson) {
      h["content-type"] = "application/json";
    }
    return h;
  }

  async get(path: string): Promise<MetadataDoc | null> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/doc/${path}`, {
      method: "GET",
      headers: this.headers(false),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`HttpMetadataStore get error: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as MetadataDoc;
  }

  async set(path: string, data: MetadataDoc, opts?: { merge?: boolean }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/doc/${path}`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify({ data, merge: opts?.merge ?? false }),
    });
    if (!res.ok) {
      throw new Error(`HttpMetadataStore set error: ${res.status} ${await res.text()}`);
    }
  }

  async update(path: string, data: MetadataDoc): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/doc/${path}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      throw new Error(`HttpMetadataStore update error: ${res.status} ${await res.text()}`);
    }
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/doc/${path}`, {
      method: "DELETE",
      headers: this.headers(false),
    });
    if (res.status === 404) return;
    if (!res.ok) {
      throw new Error(`HttpMetadataStore delete error: ${res.status} ${await res.text()}`);
    }
  }

  async query(collectionPath: string, opts?: MetadataQueryOpts): Promise<MetadataDoc[]> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/query/${encodeURIComponent(collectionPath)}`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(opts || {}),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HttpMetadataStore query error: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { docs: MetadataDoc[] };
    return json.docs || [];
  }

  async count(collectionPath: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/count/${encodeURIComponent(collectionPath)}`, {
      method: "GET",
      headers: this.headers(false),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HttpMetadataStore count error: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { count: number };
    return json.count ?? 0;
  }

  async batch(ops: MetadataBatchOp[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/metadata/batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) {
      throw new Error(`HttpMetadataStore batch error: ${res.status} ${await res.text()}`);
    }
  }
}

let storeInstance: MetadataStore | null = null;

export function getWebsiteMetadataStore(): MetadataStore {
  if (!storeInstance) {
    storeInstance = new HttpMetadataStore();
  }
  return storeInstance;
}
