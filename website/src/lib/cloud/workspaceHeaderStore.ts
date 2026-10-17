"use client";

/** NotebookShell registers workspace chrome into AppChrome (single top bar). */

export type WorkspaceHeaderMenuItem = {
  id: string;
  label: string;
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
  /** Section tabs (Entries / Calendar / …) — rendered in AppChrome, not a second bar. */
  navItems: WorkspaceHeaderNavItem[];
  activeNavId: string;
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
