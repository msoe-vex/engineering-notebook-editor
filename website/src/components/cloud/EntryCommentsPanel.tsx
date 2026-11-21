"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MessageSquarePlus, Trash2 } from "lucide-react";
import type { TiptapEditor } from "@/lib/types";
import { showNotification } from "@/components/overlays/Notification";
import { Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import {
  subscribeNotebookEvents,
  type NotebookRealtimeEvent,
} from "@/lib/cloud/notebookEvents";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

type CommentRow = {
  id: string;
  entryId: string;
  body: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string | null;
  anchorQuote?: string;
};

export function EntryCommentsPanel({
  entryId,
  editor,
  open,
  onClose,
}: {
  entryId: string;
  editor: TiptapEditor | null;
  open: boolean;
  onClose: () => void;
}) {
  const { orgId, notebookId, isArchived } = useNotebookWorkspace();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(() => {
    void cloudApi
      .listEntryComments(orgId, notebookId, entryId)
      .then((rows) => setComments(rows as CommentRow[]))
      .catch(() => undefined);
  }, [orgId, notebookId, entryId]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    subscribeNotebookEvents(
      orgId,
      notebookId,
      (event: NotebookRealtimeEvent) => {
        if (event.type === "comment.upserted" && event.entryId === entryId) {
          const c = event.comment as CommentRow;
          setComments((prev) => {
            const next = prev.filter((x) => x.id !== c.id);
            next.push(c);
            return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
        }
        if (event.type === "comment.deleted" && event.entryId === entryId) {
          setComments((prev) => prev.filter((x) => x.id !== event.commentId));
        }
      },
      ac.signal
    );
    return () => ac.abort();
  }, [open, orgId, notebookId, entryId]);

  async function addComment() {
    const text = draft.trim();
    if (!text || busy || isArchived) return;
    setBusy(true);
    try {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}`;
      let anchorQuote: string | undefined;
      if (editor) {
        const { from, to, empty } = editor.state.selection;
        if (!empty) {
          anchorQuote = editor.state.doc.textBetween(from, to, " ").slice(0, 280);
          editor.chain().focus().setCommentAnchor(id).run();
        }
      }
      await cloudApi.createEntryComment(orgId, notebookId, entryId, {
        id,
        body: text,
        anchorQuote,
      });
      setDraft("");
      showNotification("Comment added", "success");
      load();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function focusComment(commentId: string) {
    if (!editor) return;
    let found = false;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText || !node.marks) return;
      const mark = node.marks.find(
        (m) => m.type.name === "commentAnchor" && m.attrs.commentId === commentId
      );
      if (!mark) return;
      found = true;
      editor.chain().focus().setTextSelection({ from: pos, to: pos + node.nodeSize }).run();
    });
  }

  if (!open) return null;

  const visible = comments.filter((c) => showResolved || !c.resolvedAt);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-nb-outline-variant/30 bg-nb-surface">
      <div className="flex items-center justify-between gap-2 border-b border-nb-outline-variant/25 px-3 py-2">
        <h2 className="text-nb-label font-semibold text-nb-on-surface">Comments</h2>
        <button
          type="button"
          className="text-nb-caption font-semibold text-nb-on-surface-variant hover:text-nb-on-surface"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-nb-outline-variant/20 px-3 py-2">
        <label className="flex items-center gap-1.5 text-nb-caption text-nb-on-surface-variant">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {visible.map((c) => (
          <li
            key={c.id}
            className={`rounded-nb-lg border px-3 py-2 text-nb-body ${
              c.resolvedAt
                ? "border-nb-outline-variant/20 bg-nb-surface-low/40 opacity-70"
                : "border-nb-outline-variant/30 bg-nb-surface-low/60"
            }`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => focusComment(c.id)}
            >
              {c.anchorQuote ? (
                <p className="mb-1 truncate text-nb-caption italic text-nb-on-surface-variant">
                  “{c.anchorQuote}”
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-nb-on-surface">{c.body}</p>
              <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </button>
            {!isArchived && (
              <div className="mt-2 flex flex-wrap gap-1">
                {!c.resolvedAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void cloudApi
                        .patchEntryComment(orgId, notebookId, entryId, c.id, {
                          resolved: true,
                        })
                        .then(load)
                        .catch((err) => showNotification((err as Error).message, "error"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <Check size={12} /> Resolve
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void cloudApi
                        .patchEntryComment(orgId, notebookId, entryId, c.id, {
                          resolved: false,
                        })
                        .then(load)
                        .catch((err) => showNotification((err as Error).message, "error"))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Reopen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-nb-danger"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void cloudApi
                      .deleteEntryComment(orgId, notebookId, entryId, c.id)
                      .then(() => {
                        editor?.chain().focus().unsetCommentAnchor().run();
                        load();
                      })
                      .catch((err) => showNotification((err as Error).message, "error"))
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            )}
          </li>
        ))}
        {!visible.length && (
          <li className="py-8 text-center text-nb-caption text-nb-on-surface-variant">
            No comments yet. Select text and add one.
          </li>
        )}
      </ul>
      {!isArchived && (
        <div className="border-t border-nb-outline-variant/25 p-3">
          <TextField
            label="New comment"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Select text in the entry, then comment…"
          />
          <Button
            className="mt-2 w-full"
            size="sm"
            variant="secondary"
            disabled={busy || !draft.trim()}
            onClick={() => void addComment()}
          >
            <MessageSquarePlus size={14} /> Add comment
          </Button>
        </div>
      )}
    </aside>
  );
}
