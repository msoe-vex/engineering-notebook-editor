import type { ServerResponse } from "node:http";

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
      type: "ping";
      at: string;
    };

type Sub = {
  res: ServerResponse;
  heartbeat: ReturnType<typeof setInterval>;
};

function roomKey(orgId: string, notebookId: string) {
  return `${orgId}:${notebookId}`;
}

const rooms = new Map<string, Set<Sub>>();

function writeEvent(res: ServerResponse, event: NotebookRealtimeEvent) {
  if (res.writableEnded) return;
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  // Ensure chunks reach the client promptly (some proxies/buffers hold SSE otherwise).
  const flushable = res as ServerResponse & { flushHeaders?: () => void; flush?: () => void };
  if (typeof flushable.flush === "function") flushable.flush();
}

export function subscribeNotebookEvents(
  orgId: string,
  notebookId: string,
  res: ServerResponse
): () => void {
  const key = roomKey(orgId, notebookId);
  const sub: Sub = {
    res,
    heartbeat: setInterval(() => {
      writeEvent(res, { type: "ping", at: new Date().toISOString() });
    }, 25_000),
  };
  let set = rooms.get(key);
  if (!set) {
    set = new Set();
    rooms.set(key, set);
  }
  set.add(sub);
  writeEvent(res, { type: "ping", at: new Date().toISOString() });

  return () => {
    clearInterval(sub.heartbeat);
    set!.delete(sub);
    if (set!.size === 0) rooms.delete(key);
  };
}

export function publishNotebookEvent(
  orgId: string,
  notebookId: string,
  event: Exclude<NotebookRealtimeEvent, { type: "ping" }>
) {
  const set = rooms.get(roomKey(orgId, notebookId));
  if (!set?.size) return;
  for (const sub of [...set]) {
    try {
      writeEvent(sub.res, event);
    } catch {
      clearInterval(sub.heartbeat);
      set.delete(sub);
    }
  }
  if (set.size === 0) rooms.delete(roomKey(orgId, notebookId));
}
