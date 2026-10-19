"use client";

/** NotebookShell registers workspace chrome into AppChrome (single top bar). */

import type { ReactNode } from "react";

export type WorkspaceHeaderMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

export type WorkspaceHeaderNavItem = {
  id: string;
  label: string;
  href: string;
};

export type WorkspaceHeaderState = {
  orgId: string;
  notebookId: string;
  orgName: string;
  notebookName: string;
  isArchived?: boolean;
  menuItems: WorkspaceHeaderMenuItem[];
} | null;

type Listener = () => void;

let state: WorkspaceHeaderState = null;
const listeners = new Set<Listener>();

export function getWorkspaceHeader(): WorkspaceHeaderState {
  return state;
}

export function setWorkspaceHeader(next: WorkspaceHeaderState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeWorkspaceHeader(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
