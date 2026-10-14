import { Storage } from "@google-cloud/storage";
import type { StoragePort } from "./storagePort.js";
import { MemoryStorage } from "./storagePort.js";

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

  const storage = new Storage({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || "demo-engineering-notebook",
    apiEndpoint,
  });

  const bucket = storage.bucket(bucketName);
  try {
    const [exists] = await bucket.exists();
    if (!exists && apiEndpoint) {
      await bucket.create();
    }
  } catch {
    // Bucket may already exist or emulator may auto-create on upload
  }

  return {
    async putObject(key, data, contentType = "application/octet-stream") {
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
