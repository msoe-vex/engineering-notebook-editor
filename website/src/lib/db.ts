/**
 * IndexedDB wrapper for the pending-changes store.
 *
 * Each record in the store represents a file that has been created, updated,
 * or staged for deletion in GitHub mode. Nothing is written to GitHub until
 * the user explicitly clicks "Commit All".
 *
 * Local-folder mode bypasses this store entirely and writes through immediately.
 */

const DB_NAME = "notebook-pending";
const DB_VERSION = 1;
const STORE_NAME = "changes";

export type PendingOperation = "upsert" | "delete";

export interface PendingChange {
  /** Repo-relative file path, e.g. "notebook/entries/2026-04-28T09-00-00_entry.tex" */
  path: string;
  operation: PendingOperation;
  /** Text content (for .tex / .json files) or base64 string (for images).
   *  Undefined when operation === "delete". */
  content?: string;
  /** Human-readable label shown in the commit bar (e.g. "New entry", "Image upload") */
  label: string;
  /** ISO timestamp of when this change was staged */
  stagedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "path" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function stageChange(change: PendingChange): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.put(change);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeStaged(path: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.delete(path);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPending(): Promise<PendingChange[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingChange[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllPending(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPending(path: string): Promise<PendingChange | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const req = store.get(path);
    req.onsuccess = () => resolve(req.result as PendingChange | undefined);
    req.onerror = () => reject(req.error);
  });
}
