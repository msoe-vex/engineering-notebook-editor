import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import type { StoragePort } from "./storagePort.js";
import { MemoryStorage } from "./storagePort.js";

async function ensureEmulatorBucket(apiEndpoint: string, bucketName: string, projectId: string) {
  const base = apiEndpoint.replace(/\/$/, "");
  const listRes = await fetch(`${base}/storage/v1/b/${encodeURIComponent(bucketName)}`);
  if (listRes.ok) return;

  const createRes = await fetch(`${base}/storage/v1/b?project=${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: bucketName }),
  });
  // 200 / 409 (already exists) are fine
  if (!createRes.ok && createRes.status !== 409) {
    const text = await createRes.text();
    throw new Error(`Failed to create emulator bucket ${bucketName}: ${createRes.status} ${text}`);
  }
}

export async function createStorage(): Promise<StoragePort> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName || process.env.STORAGE_BACKEND === "memory") {
    return new MemoryStorage(process.env.GCS_PUBLIC_BASE_URL || "http://localhost:4443");
  }

  // Prefer explicit apiEndpoint. If STORAGE_EMULATOR_HOST is left set, @google-cloud/storage
  // omits `/storage/v1` on reads (uploads still work) — classic fake-gcs "saved but gone on refresh".
  // See https://github.com/fsouza/fake-gcs-server/issues/2198
  const rawEmulator =
    process.env.GCS_EMULATOR_ENDPOINT ||
    process.env.STORAGE_EMULATOR_HOST ||
    "";
  const apiEndpoint = rawEmulator
    ? rawEmulator.startsWith("http")
      ? rawEmulator.replace(/\/$/, "")
      : `http://${rawEmulator}`
    : undefined;
  if (apiEndpoint && process.env.STORAGE_EMULATOR_HOST) {
    delete process.env.STORAGE_EMULATOR_HOST;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || "demo-engineering-notebook";

  if (apiEndpoint) {
    // fake-gcs does not auto-create buckets; SDK bucket.create() is unreliable against it.
    await ensureEmulatorBucket(apiEndpoint, bucketName, projectId);
  }

  const storage = new Storage({
    projectId,
    ...(apiEndpoint ? { apiEndpoint } : {}),
  });

  const bucket = storage.bucket(bucketName);
  if (!apiEndpoint) {
    try {
      const [exists] = await bucket.exists();
      if (!exists) await bucket.create();
    } catch (err) {
      console.warn("[storage] bucket ensure failed", err);
    }
  }

  const publicBase = process.env.GCS_PUBLIC_BASE_URL?.replace(/\/$/, "");

  return {
    async putObject(key, data, contentType = "application/octet-stream") {
      if (apiEndpoint) {
        // Re-ensure in case fake-gcs was wiped while Core stayed up.
        await ensureEmulatorBucket(apiEndpoint, bucketName, projectId);
      }
      const file = bucket.file(key);
      await file.save(typeof data === "string" ? Buffer.from(data) : data, {
        contentType,
        resumable: false,
      });
    },
    async putObjectStream(key, stream: Readable, contentType = "application/octet-stream") {
      if (apiEndpoint) {
        await ensureEmulatorBucket(apiEndpoint, bucketName, projectId);
      }
      const file = bucket.file(key);
      const write = file.createWriteStream({
        contentType,
        resumable: false,
        metadata: { contentType },
      });
      let byteSize = 0;
      stream.on("data", (chunk: Buffer | string) => {
        byteSize += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      });
      await pipeline(stream, write);
      return { byteSize };
    },
    async getObject(key) {
      const file = bucket.file(key);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [buf] = await file.download();
      return buf;
    },
    async deleteObject(key) {
      const file = bucket.file(key);
      try {
        await file.delete({ ignoreNotFound: true });
      } catch (err) {
        // fake-gcs may not support ignoreNotFound the same way
        const [exists] = await file.exists().catch(() => [false] as [boolean]);
        if (exists) throw err;
      }
    },
    async getSignedUrl(key, action, expiresMs = 3600_000) {
      if (apiEndpoint) {
        // Prefer host-reachable base (localhost) over Docker DNS (gcs:4443).
        if (publicBase) {
          return `${publicBase}/${encodeURIComponent(key)}?alt=media`;
        }
        return `${apiEndpoint}/storage/v1/b/${bucketName}/o/${encodeURIComponent(key)}?alt=media`;
      }
      const [url] = await bucket.file(key).getSignedUrl({
        version: "v4",
        action: action === "write" ? "write" : "read",
        expires: Date.now() + expiresMs,
      });
      return url;
    },
    publicUrl(key) {
      if (publicBase) {
        return `${publicBase}/${key}`;
      }
      if (apiEndpoint) {
        return `${apiEndpoint}/storage/v1/b/${bucketName}/o/${encodeURIComponent(key)}?alt=media`;
      }
      return `https://storage.googleapis.com/${bucketName}/${key}`;
    },
  };
}
