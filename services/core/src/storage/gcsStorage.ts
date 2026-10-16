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

  const apiEndpoint = process.env.STORAGE_EMULATOR_HOST
    ? process.env.STORAGE_EMULATOR_HOST.startsWith("http")
      ? process.env.STORAGE_EMULATOR_HOST
      : `http://${process.env.STORAGE_EMULATOR_HOST}`
    : undefined;

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || "demo-engineering-notebook";

  if (apiEndpoint) {
    // fake-gcs does not auto-create buckets; SDK bucket.create() is unreliable against it.
    await ensureEmulatorBucket(apiEndpoint, bucketName, projectId);
  }

  const storage = new Storage({
    projectId,
    apiEndpoint,
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
        // fake-gcs-server: unsigned public-style URL
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
      if (process.env.GCS_PUBLIC_BASE_URL) {
        return `${process.env.GCS_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
      }
      if (apiEndpoint) {
        return `${apiEndpoint}/storage/v1/b/${bucketName}/o/${encodeURIComponent(key)}?alt=media`;
      }
      return `https://storage.googleapis.com/${bucketName}/${key}`;
    },
  };
}
