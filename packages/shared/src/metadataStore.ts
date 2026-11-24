/**
 * MetadataStore — platform-agnostic document storage port.
 * Firestore is the first adapter; SQL, Mongo, or SQLite can implement this interface.
 */
export type MetadataDoc = Record<string, unknown>;

export type MetadataWhereOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type MetadataWhere = {
  field: string;
  op: MetadataWhereOp;
  value: unknown;
};

export type MetadataQueryOpts = {
  where?: MetadataWhere[];
  orderBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
};

export type MetadataBatchOp =
  | { op: "set"; path: string; data: MetadataDoc; merge?: boolean }
  | { op: "update"; path: string; data: MetadataDoc }
  | { op: "delete"; path: string };

export interface MetadataStore {
  get(path: string): Promise<MetadataDoc | null>;
  set(path: string, data: MetadataDoc, opts?: { merge?: boolean }): Promise<void>;
  /** Partial field update (adapter may map to vendor update semantics). */
  update(path: string, data: MetadataDoc): Promise<void>;
  delete(path: string): Promise<void>;
  /** List documents under a collection path (optional where / orderBy / limit). */
  query(collectionPath: string, opts?: MetadataQueryOpts): Promise<MetadataDoc[]>;
  /** Optional collection count. */
  count?(collectionPath: string): Promise<number>;
  /** Multi-doc write. Adapter may chunk vendor limits (e.g. Firestore 500). */
  batch(ops: MetadataBatchOp[]): Promise<void>;
}
