/**
 * IndexedDB wrapper for the pending-changes store.
 *
 * Each record in the store represents a file that has been created, updated,
 * or staged for deletion in GitHub mode. Nothing is written to GitHub until
 * the user explicitly clicks "Commit All".
 *
 * Local-folder mode bypasses this store entirely and writes through immediately.
 */

const DEFAULT_DB_NAME = "notebook-pending";
const DB_VERSION = 4;
const STORE_NAME = "changes";
const RESOURCE_STORE = "resources";
const WORKSPACE_STORE = "workspace"; // Legacy
const PROJECT_STORE = "projects";
const HANDLE_STORE = "handles";

export type PendingOperation = "upsert" | "delete";

export interface PendingChange {
  /** Repo-relative file path, e.g. "entries/2026-04-28T09-00-00_entry.tex" */
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

export interface ResourceCacheEntry {
  path: string;
  dataUrl: string;
}

function openDB(dbName: string = DEFAULT_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(RESOURCE_STORE)) {
        db.createObjectStore(RESOURCE_STORE, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE);
      }
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, WORKSPACE_STORE, "readwrite");
    const req = store.put(handle, "last-handle");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, WORKSPACE_STORE, "readonly");
    const req = store.get("last-handle");
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function clearWorkspaceHandle(): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, WORKSPACE_STORE, "readwrite");
    const req = store.delete("last-handle");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Project Management ────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  type: "github" | "local" | "temporary";
  lastOpened: string;
  githubConfig?: any;
  folderName?: string;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, PROJECT_STORE, "readwrite");
    const req = store.put(project);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getProjects(): Promise<Project[]> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, PROJECT_STORE, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as Project[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, PROJECT_STORE, "readonly");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as Project | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, PROJECT_STORE, "readwrite");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveProjectHandle(projectId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, HANDLE_STORE, "readwrite");
    const req = store.put(handle, projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectHandle(projectId: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, HANDLE_STORE, "readonly");
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectHandle(projectId: string): Promise<void> {
  const db = await openDB(DEFAULT_DB_NAME);
  return new Promise((resolve, reject) => {
    const store = tx(db, HANDLE_STORE, "readwrite");
    const req = store.delete(projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function putResource(dbName: string, entry: ResourceCacheEntry): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, RESOURCE_STORE, "readwrite");
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getResource(dbName: string, path: string): Promise<string | undefined> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, RESOURCE_STORE, "readonly");
    const req = store.get(path);
    req.onsuccess = () => resolve((req.result as ResourceCacheEntry | undefined)?.dataUrl);
    req.onerror = () => reject(req.error);
  });
}

export async function stageChange(dbName: string, change: PendingChange): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, "readwrite");
    const req = store.put(change);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeStaged(dbName: string, path: string): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, "readwrite");
    const req = store.delete(path);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPending(dbName: string): Promise<PendingChange[]> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingChange[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllPending(dbName: string): Promise<void> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPending(dbName: string, path: string): Promise<PendingChange | undefined> {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, "readonly");
    const req = store.get(path);
    req.onsuccess = () => resolve(req.result as PendingChange | undefined);
    req.onerror = () => reject(req.error);
  });
}
