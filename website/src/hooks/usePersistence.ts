import { useCallback } from "react";
import {
  stageChange,
  removeStaged,
} from "@/lib/db";
import {
  writeLocalFile,
  deleteLocalFileAtPath,
  queueLocalOp
} from "@/lib/fs";
import { NotebookMetadata } from "@/lib/metadata";
import { INDEX_PATH } from "@/lib/constants";

export type WorkspaceMode = "local" | "github" | "temporary" | "none";

interface PersistenceOptions {
  mode: WorkspaceMode;
  dbName: string;
  dirHandle: FileSystemDirectoryHandle | null;
  indexPath?: string;
}

export function usePersistence({ mode, dbName, dirHandle, indexPath = INDEX_PATH }: PersistenceOptions) {

  const stage = useCallback(async (op: { path: string; content?: string; operation: "upsert" | "delete"; label: string }) => {
    if (mode === "github" || mode === "temporary") {
      await stageChange(dbName, { ...op, stagedAt: new Date().toISOString() });
    }
  }, [mode, dbName]);

  const saveMetadata = useCallback(async (metadata: NotebookMetadata, label = "Metadata update") => {
    const metaStr = JSON.stringify(metadata, null, 2);
    if (mode === "local" && dirHandle) {
      await queueLocalOp(() => writeLocalFile(dirHandle, indexPath, metaStr));
    } else if (mode === "github" || mode === "temporary") {
      await stage({ path: indexPath, content: metaStr, operation: "upsert", label });
    }
  }, [mode, dirHandle, indexPath, stage]);

  const saveEntry = useCallback(async (path: string, content: string, label: string) => {
    if (mode === "local" && dirHandle) {
      await queueLocalOp(() => writeLocalFile(dirHandle, path, content));
    } else if (mode === "github" || mode === "temporary") {
      await stage({ path, content, operation: "upsert", label });
    }
  }, [mode, dirHandle, stage]);

  const deleteFile = useCallback(async (path: string, label: string) => {
    if (mode === "local" && dirHandle) {
      await queueLocalOp(() => deleteLocalFileAtPath(dirHandle, path));
    } else if (mode === "github" || mode === "temporary") {
      await removeStaged(dbName, path);
      await stage({ path, operation: "delete", label });
    }
  }, [mode, dirHandle, dbName, stage]);

  const uploadResource = useCallback(async (path: string, base64: string, label: string) => {
    if (mode === "local" && dirHandle) {
      await queueLocalOp(() => writeLocalFile(dirHandle, path, base64, true));
    } else if (mode === "github" || mode === "temporary") {
      await stage({ path, content: base64, operation: "upsert", label });
    }
  }, [mode, dirHandle, stage]);

  return {
    saveMetadata,
    saveEntry,
    deleteFile,
    uploadResource,
    stage,
  };
}
