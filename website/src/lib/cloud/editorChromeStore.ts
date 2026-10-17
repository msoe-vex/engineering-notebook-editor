"use client";

/** Entry editor publishes connection + save status into AppChrome. */

export type CollabConnectionStatus = "connected" | "connecting" | "offline";

export type EntrySaveState = "idle" | "saving" | "saved" | "error";

export type EditorPeer = {
  clientId: number;
  name: string;
  color: string;
};

export type EditorChromeState = {
  connection: CollabConnectionStatus | null;
  saveState: EntrySaveState | null;
  peers: EditorPeer[];
  onReconnect?: (() => void) | null;
};

type Listener = () => void;

const empty: EditorChromeState = {
  connection: null,
  saveState: null,
  peers: [],
  onReconnect: null,
};

let state: EditorChromeState = empty;
const listeners = new Set<Listener>();

export function getEditorChrome(): EditorChromeState {
  return state;
}

/** Stable snapshot for `useSyncExternalStore` SSR / server getServerSnapshot. */
export function getEditorChromeServerSnapshot(): EditorChromeState {
  return empty;
}

function emit() {
  listeners.forEach((l) => l());
}

export function patchEditorChrome(partial: Partial<EditorChromeState>) {
  state = { ...state, ...partial };
  emit();
}

export function clearEditorChrome() {
  state = empty;
  emit();
}

export function subscribeEditorChrome(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
