"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NotebookWorkspaceState } from "./notebook-types";

const NotebookWorkspaceContext = createContext<NotebookWorkspaceState | null>(null);

export function NotebookWorkspaceProvider({
  value,
  children,
}: {
  value: NotebookWorkspaceState;
  children: ReactNode;
}) {
  return (
    <NotebookWorkspaceContext.Provider value={value}>{children}</NotebookWorkspaceContext.Provider>
  );
}

export function useNotebookWorkspace(): NotebookWorkspaceState {
  const ctx = useContext(NotebookWorkspaceContext);
  if (!ctx) {
    throw new Error("useNotebookWorkspace must be used under NotebookWorkspaceProvider");
  }
  return ctx;
}
