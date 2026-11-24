import type {
  MetadataDoc,
  MetadataWhereOp,
  MetadataWhere,
  MetadataQueryOpts,
  MetadataBatchOp,
  MetadataStore,
} from "@engineering-notebook/shared";

export type {
  MetadataDoc,
  MetadataWhereOp,
  MetadataWhere,
  MetadataQueryOpts,
  MetadataBatchOp,
  MetadataStore,
};

import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirestore } from "./firestore.js";

const FIRESTORE_BATCH_LIMIT = 450;

export class FirestoreMetadataStore implements MetadataStore {
  async count(collectionPath: string): Promise<number> {
    const snap = await getFirestore().collection(collectionPath).count().get();
    return snap.data().count;
  }
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

  async query(collectionPath: string, opts?: MetadataQueryOpts): Promise<MetadataDoc[]> {
    let ref: Query = getFirestore().collection(collectionPath);
    for (const clause of opts?.where ?? []) {
      ref = ref.where(clause.field, clause.op, clause.value);
    }
    if (opts?.orderBy) {
      ref = ref.orderBy(opts.orderBy.field, opts.orderBy.direction ?? "asc");
    }
    if (opts?.limit != null) {
      ref = ref.limit(opts.limit);
    }
    const snap = await ref.get();
    return snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as MetadataDoc) }));
  }

  async batch(ops: MetadataBatchOp[]): Promise<void> {
    if (ops.length === 0) return;
    const db = getFirestore();
    for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = db.batch();
      for (const op of chunk) {
        const ref = db.doc(op.path);
        if (op.op === "delete") {
          batch.delete(ref);
        } else if (op.op === "set") {
          const { id: _id, ...rest } = op.data;
          batch.set(ref, rest, { merge: op.merge ?? false });
        } else {
          const { id: _id, ...rest } = op.data;
          batch.update(ref, rest);
        }
      }
      await batch.commit();
    }
  }
}

let store: MetadataStore | null = null;

export function getMetadataStore(): MetadataStore {
  if (!store) store = new FirestoreMetadataStore();
  return store;
}
