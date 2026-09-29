import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { TiptapEditor } from "@/lib/types";
import ValidationTooltip from "../ui/ValidationTooltip";
import { commitNodeViewAttrHistory, patchNodeViewAttrs } from "./patchNodeViewAttrs";

interface NodeViewInputProps {
  value: string;
  /** Node attr key (e.g. "title" / "caption"). Used with editor+getPos for history-safe edits. */
  attr?: string;
  onUpdate?: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  required?: boolean;
  missingMessage?: string;
  editor?: TiptapEditor | null;
  getPos?: () => number | undefined;
  multiline?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  spellCheck?: boolean;
}

/**
 * Input for TipTap NodeViews.
 *
 * While focused, edits update the node without TipTap history and Ctrl+Z/Y use a
 * local stack (avoids node re-selection / caret jump to end). On blur, one
 * history step is committed for the whole focus session.
 */
export function NodeViewInput({
  value,
  attr,
  onUpdate,
  placeholder,
  className,
  style,
  required = false,
  missingMessage = "This field is required.",
  editor,
  getPos,
  multiline = false,
  onKeyDown: onKeyDownProp,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  inputRef: inputRefProp,
  spellCheck,
}: NodeViewInputProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const lastEmittedRef = useRef(value || "");
  const baselineRef = useRef(value || "");
  const focusedRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const innerRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const inputRef = inputRefProp ?? innerRef;
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const showError = required && !localValue.trim();
  const useAttrPatch = Boolean(editor && getPos && attr);

  const rememberSelection = (el?: HTMLInputElement | HTMLTextAreaElement | null) => {
    const target = el ?? inputRef.current;
    if (!target) return;
    selectionRef.current = {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
    };
  };

  const restoreSelection = () => {
    const el = inputRef.current;
    const sel = selectionRef.current;
    if (!el || !sel) return;
    const max = el.value.length;
    const start = Math.max(0, Math.min(sel.start, max));
    const end = Math.max(0, Math.min(sel.end, max));
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* some input types reject setSelectionRange */
    }
  };

  const applyValue = (nextValue: string, options?: { history?: boolean }) => {
    lastEmittedRef.current = nextValue;
    setLocalValue(nextValue);
    if (useAttrPatch && attr) {
      patchNodeViewAttrs(editor, getPos, { [attr]: nextValue }, { history: options?.history ?? false });
    } else {
      onUpdate?.(nextValue);
    }
  };

  // Sync external attr changes only when not focused (generate button, etc.)
  useEffect(() => {
    const incoming = value || "";
    if (focusedRef.current) return;
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    baselineRef.current = incoming;
    setLocalValue(incoming);
  }, [value]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    if (multiline) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }

    if (document.activeElement === el) {
      const sel = selectionRef.current;
      if (!sel) return;
      const max = el.value.length;
      const start = Math.max(0, Math.min(sel.start, max));
      const end = Math.max(0, Math.min(sel.end, max));
      try {
        el.setSelectionRange(start, end);
      } catch {
        /* some input types reject setSelectionRange */
      }
    }
  }, [localValue, multiline, inputRef]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    selectionRef.current = {
      start: e.target.selectionStart ?? nextValue.length,
      end: e.target.selectionEnd ?? nextValue.length,
    };
    if (nextValue !== localValue) {
      undoStackRef.current.push(localValue);
      redoStackRef.current = [];
    }
    applyValue(nextValue, { history: false });
  };

  const undoLocal = () => {
    const prev = undoStackRef.current.pop();
    if (prev === undefined) return false;
    redoStackRef.current.push(localValue);
    rememberSelection();
    // Prefer caret at end of the restored shorter/longer text near prior point
    const el = inputRef.current;
    const caret = el?.selectionStart ?? prev.length;
    selectionRef.current = {
      start: Math.min(caret, prev.length),
      end: Math.min(caret, prev.length),
    };
    applyValue(prev, { history: false });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      restoreSelection();
    });
    return true;
  };

  const redoLocal = () => {
    const next = redoStackRef.current.pop();
    if (next === undefined) return false;
    undoStackRef.current.push(localValue);
    rememberSelection();
    selectionRef.current = { start: next.length, end: next.length };
    applyValue(next, { history: false });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      restoreSelection();
    });
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (multiline) e.stopPropagation();
    onKeyDownProp?.(e);
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!undoLocal() && editor && !editor.isDestroyed) {
        // No local edits — fall through to editor history (e.g. undoing other nodes)
        editor.commands.undo();
      }
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      e.stopPropagation();
      if (!redoLocal() && editor && !editor.isDestroyed) {
        editor.commands.redo();
      }
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focusedRef.current = true;
    baselineRef.current = localValue;
    undoStackRef.current = [];
    redoStackRef.current = [];
    onFocusProp?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Commit while still "focused" so intermediate attr echoes are ignored.
    if (useAttrPatch && attr) {
      commitNodeViewAttrHistory(editor, getPos, attr, baselineRef.current, localValue);
    }
    focusedRef.current = false;
    undoStackRef.current = [];
    redoStackRef.current = [];
    baselineRef.current = localValue;
    lastEmittedRef.current = localValue;
    onBlurProp?.(e);
  };

  const wrapperClass = className?.includes("w-full")
    ? `w-full flex ${multiline ? "items-start" : "items-center"} justify-center gap-1.5`
    : className?.includes("flex-1")
      ? "flex-1 min-w-0 flex items-center gap-1.5"
      : "inline-flex items-center gap-1.5 min-w-0";

  const fieldClassName = multiline
    ? `${className || ""} whitespace-pre-wrap break-words resize-none overflow-hidden`.trim()
    : className;

  return (
    <div className={wrapperClass}>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={1}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={() => rememberSelection()}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={fieldClassName}
          style={style}
          spellCheck={spellCheck}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={() => rememberSelection()}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={className}
          style={style}
          spellCheck={spellCheck}
        />
      )}
      {showError && (
        <ValidationTooltip
          errors={[missingMessage]}
          size={12}
          position="bottom"
          className="shrink-0"
          iconContainerClassName="text-amber-500"
        />
      )}
    </div>
  );
}
