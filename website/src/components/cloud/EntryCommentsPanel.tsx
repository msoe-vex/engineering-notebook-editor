"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Check, MessageSquare, MessageSquarePlus, Trash2 } from "lucide-react";
import type { TiptapEditor } from "@/lib/types";
import { showNotification } from "@/components/overlays/Notification";
import { Button, Checkbox, Dialog } from "@/components/ui";
import { cloudApi, type MemberSummary } from "@/lib/cloud/api";
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
  mentionedUids?: string[];
};

function mentionLabel(p: MemberSummary) {
  return (p.displayName || p.email || "Member").trim();
}

function ComposeCommentDialog({
  open,
  onClose,
  people,
  initialQuote,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  people: MemberSummary[];
  initialQuote?: string;
  busy: boolean;
  onSubmit: (body: string, mentionedUids: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setMentioned([]);
      setMentionQuery(null);
      setMentionStart(null);
      setHighlight(0);
    }
  }, [open]);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return people
      .filter((p) => {
        const name = (p.displayName || "").toLowerCase();
        const email = (p.email || "").toLowerCase();
        return !q || name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [mentionQuery, people]);

  function syncMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const match = /(?:^|[\s([{])@([^\s@]*)$/.exec(before);
    if (!match) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionStart(caret - match[1].length - 1);
    setMentionQuery(match[1]);
    setHighlight(0);
  }

  function insertMention(p: MemberSummary) {
    if (mentionStart == null || !textareaRef.current) return;
    const el = textareaRef.current;
    const caret = el.selectionStart;
    const label = mentionLabel(p);
    const before = text.slice(0, mentionStart);
    const after = text.slice(caret);
    const next = `${before}@${label} ${after}`;
    setText(next);
    setMentioned((prev) => (prev.includes(p.uid) ? prev : [...prev, p.uid]));
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const pos = before.length + label.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function resolveMentionsFromText(body: string): string[] {
    const ids = new Set(mentioned);
    for (const p of people) {
      const label = mentionLabel(p);
      if (label && body.includes(`@${label}`)) ids.add(p.uid);
      if (p.email && body.includes(`@${p.email}`)) ids.add(p.uid);
    }
    return [...ids];
  }

  return (
    <Dialog
      isOpen={open}
      onClose={() => !busy && onClose()}
      title="Add comment"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !text.trim()}
            onClick={() => void onSubmit(text.trim(), resolveMentionsFromText(text))}
          >
            {busy ? "Saving…" : "Comment"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {initialQuote ? (
          <p className="rounded-nb-lg bg-nb-surface-low px-3 py-2 text-nb-caption italic text-nb-on-surface-variant">
            “{initialQuote}”
          </p>
        ) : (
          <p className="text-nb-caption text-nb-on-surface-variant">
            Comment on the current selection (or the entry if nothing is selected). Type @ to
            mention someone.
          </p>
        )}
        <div className="relative">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-nb-on-surface-variant">
              Comment
            </span>
            <textarea
              ref={textareaRef}
              className="min-h-[6rem] w-full rounded-xl border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2.5 text-sm text-nb-on-surface outline-none transition-colors focus:border-nb-primary"
              value={text}
              onChange={(e) => {
                const value = e.target.value;
                setText(value);
                syncMentionState(value, e.target.selectionStart);
              }}
              onKeyUp={(e) => syncMentionState(text, e.currentTarget.selectionStart)}
              onClick={(e) => syncMentionState(text, e.currentTarget.selectionStart)}
              onKeyDown={(e) => {
                if (mentionQuery === null || !suggestions.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => (h + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
                } else if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(suggestions[highlight] || suggestions[0]);
                } else if (e.key === "Escape") {
                  setMentionQuery(null);
                  setMentionStart(null);
                }
              }}
              placeholder="Write a note… Type @ to mention a member"
            />
          </label>
          {mentionQuery !== null && (
            <div className="absolute right-0 left-0 z-20 mt-1 max-h-48 overflow-auto rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface shadow-nb-md">
              {suggestions.length ? (
                <ul className="py-1">
                  {suggestions.map((p, i) => (
                    <li key={p.uid}>
                      <button
                        type="button"
                        className={`flex w-full flex-col px-3 py-2 text-left text-nb-label ${
                          i === highlight ? "bg-nb-primary/10" : "hover:bg-nb-surface-low"
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertMention(p)}
                      >
                        <span className="font-semibold text-nb-on-surface">
                          @{mentionLabel(p)}
                        </span>
                        {p.email && p.displayName ? (
                          <span className="text-nb-caption text-nb-on-surface-variant">
                            {p.email}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-nb-caption text-nb-on-surface-variant">No matches</p>
              )}
            </div>
          )}
        </div>
        {mentioned.length > 0 && (
          <p className="text-nb-caption text-nb-on-surface-variant">
            Will notify:{" "}
            {mentioned
              .map((uid) => {
                const p = people.find((x) => x.uid === uid);
                return p ? `@${mentionLabel(p)}` : null;
              })
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function EntryCommentsPanel({
  entryId,
  editor,
  open,
  onClose,
  onRequestOpen,
}: {
  entryId: string;
  editor: TiptapEditor | null;
  open: boolean;
  onClose: () => void;
  onRequestOpen?: () => void;
}) {
  const { orgId, notebookId, isArchived } = useNotebookWorkspace();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeQuote, setComposeQuote] = useState<string | undefined>();
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const commentRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const load = useCallback(() => {
    void cloudApi
      .listEntryComments(orgId, notebookId, entryId)
      .then((rows) => setComments(rows as CommentRow[]))
      .catch(() => undefined);
  }, [orgId, notebookId, entryId]);

  useEffect(() => {
    void cloudApi
      .listMembers(orgId)
      .then((rows) => setPeople(rows))
      .catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !activeCommentId) return;
    const el = commentRefs.current[activeCommentId];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, activeCommentId, comments]);

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

  const openCommentFromAnchor = useCallback(
    (commentId: string) => {
      setActiveCommentId(commentId);
      setShowResolved(true);
      onRequestOpen?.();
      if (editor) {
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
    },
    [editor, onRequestOpen]
  );

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest?.("[data-comment-id]") as HTMLElement | null;
      if (!anchor) return;
      const commentId = anchor.getAttribute("data-comment-id");
      if (!commentId) return;
      ev.preventDefault();
      openCommentFromAnchor(commentId);
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor, openCommentFromAnchor]);

  function openComposeFromSelection() {
    let quote: string | undefined;
    if (editor) {
      const { from, to, empty } = editor.state.selection;
      if (!empty) quote = editor.state.doc.textBetween(from, to, " ").slice(0, 280);
    }
    setComposeQuote(quote);
    setComposeOpen(true);
    onRequestOpen?.();
  }

  async function submitComment(text: string, mentionedUids: string[]) {
    if (busy || isArchived) return;
    setBusy(true);
    try {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}`;
      if (editor && composeQuote) {
        editor.chain().focus().setCommentAnchor(id).run();
      }
      await cloudApi.createEntryComment(orgId, notebookId, entryId, {
        id,
        body: text,
        anchorQuote: composeQuote,
        mentionedUids,
      });
      setComposeOpen(false);
      setActiveCommentId(id);
      showNotification("Comment added", "success");
      load();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function focusComment(commentId: string) {
    setActiveCommentId(commentId);
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

  const nameByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) map.set(p.uid, mentionLabel(p));
    return map;
  }, [people]);

  const visible = comments.filter((c) => showResolved || !c.resolvedAt);

  return (
    <>
      {editor && !isArchived && (
        <BubbleMenu
          editor={editor}
          options={{ placement: "right-start", offset: 8 }}
          shouldShow={({ state }) => !state.selection.empty}
        >
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface shadow-md text-nb-primary hover:bg-nb-surface-low"
            title="Comment on selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              openComposeFromSelection();
            }}
          >
            <MessageSquarePlus size={16} />
          </button>
        </BubbleMenu>
      )}

      <ComposeCommentDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        people={people}
        initialQuote={composeQuote}
        busy={busy}
        onSubmit={submitComment}
      />

      {open ? (
        <aside className="flex h-full w-72 shrink-0 flex-col border-l border-nb-outline-variant/30 bg-nb-surface">
          <div className="flex items-center justify-between gap-2 border-b border-nb-outline-variant/25 px-3 py-2">
            <h2 className="text-nb-label font-semibold text-nb-on-surface">Comments</h2>
            <div className="flex items-center gap-1">
              {!isArchived && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="New comment"
                  onClick={() => openComposeFromSelection()}
                >
                  <MessageSquarePlus size={14} />
                </Button>
              )}
              <button
                type="button"
                className="text-nb-caption font-semibold text-nb-on-surface-variant hover:text-nb-on-surface"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-nb-outline-variant/20 px-3 py-2">
            <Checkbox
              label="Show resolved"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
          </div>
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {visible.map((c) => (
              <li
                key={c.id}
                ref={(el) => {
                  commentRefs.current[c.id] = el;
                }}
                className={`rounded-nb-lg border px-3 py-2 text-nb-body ${
                  activeCommentId === c.id
                    ? "border-nb-primary ring-1 ring-nb-primary/30"
                    : c.resolvedAt
                      ? "border-nb-outline-variant/20 bg-nb-surface-low/40 opacity-70"
                      : "border-nb-outline-variant/30 bg-nb-surface-low/60"
                }`}
              >
                <button type="button" className="w-full text-left" onClick={() => focusComment(c.id)}>
                  {c.anchorQuote ? (
                    <p className="mb-1 truncate text-nb-caption italic text-nb-on-surface-variant">
                      “{c.anchorQuote}”
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-nb-on-surface">{c.body}</p>
                  {c.mentionedUids?.length ? (
                    <p className="mt-1 text-nb-caption text-nb-primary">
                      {c.mentionedUids.map((uid) => `@${nameByUid.get(uid) || "member"}`).join(" ")}
                    </p>
                  ) : null}
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
                No comments yet. Select text and click the comment button on the margin.
              </li>
            )}
          </ul>
        </aside>
      ) : null}
    </>
  );
}

/** Toolbar trigger — exported for CollaborativeEntryEditor. */
export function CommentToolbarButton({
  active,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "ghost"}
      title="Comments"
      onClick={onClick}
    >
      <MessageSquare size={14} />
    </Button>
  );
}
