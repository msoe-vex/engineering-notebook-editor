/**
 * MetadataStore — platform-agnostic document API.
 * Firestore is the first adapter; routes should prefer this over raw SDK types.
 */
export type MetadataDoc = Record<string, unknown>;

export interface MetadataStore {
  get(path: string): Promise<MetadataDoc | null>;
  set(path: string, data: MetadataDoc, opts?: { merge?: boolean }): Promise<void>;
  /** Partial field update (adapter may map to vendor update semantics). */
  update(path: string, data: MetadataDoc): Promise<void>;
  delete(path: string): Promise<void>;
}

import { getFirestore } from "./firestore.js";

export class FirestoreMetadataStore implements MetadataStore {
  async get(path: string): Promise<MetadataDoc | null> {
    const snap = await getFirestore().doc(path).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as MetadataDoc) };
  }

  async set(path: string, data: MetadataDoc, opts?: { merge?: boolean }): Promise<void> {
    const { id: _id, ...rest } = data;
    await getFirestore().doc(path).set(rest, { merge: opts?.merge ?? false });
  }

  async update(path: string, data: MetadataDoc): Promise<void> {
    const { id: _id, ...rest } = data;
    await getFirestore().doc(path).update(rest);
  }

  async delete(path: string): Promise<void> {
    await getFirestore().doc(path).delete();
  }
}

let store: MetadataStore | null = null;

export function getMetadataStore(): MetadataStore {
  if (!store) store = new FirestoreMetadataStore();
  return store;
}
