import type { TiptapEditor } from "@/lib/types";

/** Patch attrs on the node at getPos, optionally skipping history (for live typing). */
export function patchNodeViewAttrs(
  editor: TiptapEditor | null | undefined,
  getPos: (() => number | undefined) | undefined,
  patch: Record<string, unknown>,
  options?: { history?: boolean }
): void {
  if (!editor || editor.isDestroyed || !getPos) return;
  const pos = getPos();
  if (typeof pos !== "number" || pos < 0) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;

  const nextAttrs = { ...node.attrs, ...patch };
  const unchanged = Object.keys(patch).every((key) => node.attrs[key] === nextAttrs[key]);
  if (unchanged) return;

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs);
  if (options?.history === false) {
    tr.setMeta("addToHistory", false);
  }
  editor.view.dispatch(tr);
}

/**
 * After a focus session of history-less edits, record one undoable step so
 * Ctrl+Z outside the field can revert the whole edit.
 */
export function commitNodeViewAttrHistory(
  editor: TiptapEditor | null | undefined,
  getPos: (() => number | undefined) | undefined,
  attr: string,
  baseline: string,
  current: string
): void {
  if (!editor || editor.isDestroyed || !getPos) return;
  if (baseline === current) return;
  const pos = getPos();
  if (typeof pos !== "number" || pos < 0) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;

  // Snap back without history, then re-apply with history → one undo step.
  const reset = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: baseline });
  reset.setMeta("addToHistory", false);
  editor.view.dispatch(reset);

  const nodeAfter = editor.state.doc.nodeAt(pos);
  if (!nodeAfter) return;
  const apply = editor.state.tr.setNodeMarkup(pos, undefined, { ...nodeAfter.attrs, [attr]: current });
  editor.view.dispatch(apply);
}
