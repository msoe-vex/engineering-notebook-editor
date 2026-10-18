"use client";

import { getIdToken } from "./firebase";

const coreBase = () =>
  (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");

export type NotebookRealtimeEvent =
  | {
      type: "entry.upserted";
      entryId: string;
      entry: Record<string, unknown>;
      at: string;
    }
  | {
      type: "entry.deleted";
      entryId: string;
      at: string;
    }
  | {
      type: "notebook.updated";
      notebook: Record<string, unknown>;
      at: string;
    }
  | {
      type: "entries.changed";
      at: string;
    }
  | {
      type: "compile.progress";
      jobId: string;
      status: string;
      progress: number;
      at: string;
    }
  | {
      type: "compile.done";
      jobId: string;
      lastCompiled: string;
      at: string;
    }
  | {
      type: "compile.failed";
      jobId: string;
      error: string;
      at: string;
    }
  | {
      type: "ping";
      at: string;
    };

function parseSseChunk(
  buffer: string,
  onEvent: (event: NotebookRealtimeEvent) => void
): string {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      const parsed = JSON.parse(dataLines.join("\n")) as NotebookRealtimeEvent;
      if (!parsed?.type) (parsed as { type: string }).type = eventType;
      onEvent(parsed);
    } catch {
      // ignore malformed frames
    }
  }
  return rest;
}

/**
 * Subscribe to Core notebook metadata SSE (Bearer auth via fetch — not EventSource).
 * Reconnects with backoff until `signal` aborts.
 */
export function subscribeNotebookEvents(
  orgId: string,
  notebookId: string,
  onEvent: (event: NotebookRealtimeEvent) => void,
  signal: AbortSignal
): void {
  let attempt = 0;

  const connect = async () => {
    if (signal.aborted) return;
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(
        `${coreBase()}/orgs/${orgId}/notebooks/${notebookId}/events`,
        { headers, signal }
      );
      if (!res.ok || !res.body) {
        throw new Error(`events ${res.status}`);
      }
      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseChunk(buffer, onEvent);
      }
    } catch (err) {
      if (signal.aborted) return;
      console.warn("Notebook events disconnected", err);
    }
    if (signal.aborted) return;
    attempt += 1;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    await new Promise((r) => setTimeout(r, delay));
    void connect();
  };

  void connect();
}
