import type { Readable } from "node:stream";

export interface StoragePort {
  putObject(key: string, data: Buffer | string, contentType?: string): Promise<void>;
  /**
   * Stream bytes to storage without buffering the entire body in Core memory.
   * Returns total byte size written.
   */
  putObjectStream(
    key: string,
    stream: Readable,
    contentType?: string
  ): Promise<{ byteSize: number }>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl(key: string, action: "read" | "write", expiresMs?: number): Promise<string>;
  publicUrl(key: string): string;
}

/**
 * In-memory / local-file style storage for tests; used when GCS is unavailable.
 */
export class MemoryStorage implements StoragePort {
  private objects = new Map<string, { data: Buffer; contentType: string }>();
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:4443") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async putObject(key: string, data: Buffer | string, contentType = "application/octet-stream") {
    this.objects.set(key, {
      data: typeof data === "string" ? Buffer.from(data) : data,
      contentType,
    });
  }

  async putObjectStream(key: string, stream: Readable, contentType = "application/octet-stream") {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    await this.putObject(key, data, contentType);
    return { byteSize: data.byteLength };
  }

  async getObject(key: string) {
    return this.objects.get(key)?.data ?? null;
  }

  async deleteObject(key: string) {
    this.objects.delete(key);
  }

  async getSignedUrl(key: string, _action: "read" | "write", _expiresMs = 3600_000) {
    return this.publicUrl(key);
  }

  publicUrl(key: string) {
    const bucket = process.env.GCS_BUCKET || "engineering-notebook";
    return `${this.baseUrl}/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}?alt=media`;
  }

  /** Expose for BusyTeX proxy when using memory store in the same process. */
  getRaw(key: string) {
    return this.objects.get(key);
  }
}
