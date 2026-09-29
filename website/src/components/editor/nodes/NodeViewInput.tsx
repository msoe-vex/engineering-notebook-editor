import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { TiptapEditor } from "@/lib/types";
import ValidationTooltip from "../ui/ValidationTooltip";

interface NodeViewInputProps {
  value: string;
  onUpdate: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  required?: boolean;
  missingMessage?: string;
  editor?: TiptapEditor | null;
  multiline?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  spellCheck?: boolean;
}

/**
 * Input for TipTap NodeViews. Local draft is the source of truth while typing;
 * TipTap attribute echoes of our own edits are ignored so the caret stays put.
 * External updates (undo, AI generate) still sync in.
 */
export function NodeViewInput({
  value,
  onUpdate,
  placeholder,
  className,
  style,
  required = false,
  missingMessage = "This field is required.",
  editor,
  multiline = false,
  onKeyDown: onKeyDownProp,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  inputRef: inputRefProp,
  spellCheck,
}: NodeViewInputProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const lastEmittedRef = useRef(value || "");
  const innerRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const inputRef = inputRefProp ?? innerRef;
  const showError = required && !localValue.trim();

  // Sync only when TipTap/node attrs change from something other than our emit
  // (e.g. undo, redo, GenerateButton). Echoes of onUpdate are ignored.
  useEffect(() => {
    const incoming = value || "";
    if (incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      setLocalValue(incoming);
    }
  }, [value]);

  useLayoutEffect(() => {
    if (!multiline) return;
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
    if (document.activeElement === el && start != null && end != null) {
      try {
        el.setSelectionRange(start, end);
      } catch {
        /* some input types reject setSelectionRange */
      }
    }
  }, [localValue, multiline, inputRef]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    lastEmittedRef.current = nextValue;
    setLocalValue(nextValue);
    onUpdate(nextValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (multiline) e.stopPropagation();
    onKeyDownProp?.(e);
    if (e.defaultPrevented) return;
    if (!editor || editor.isDestroyed) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      editor.commands.undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      e.stopPropagation();
      editor.commands.redo();
    }
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
          onFocus={onFocusProp}
          onBlur={onBlurProp}
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
          onFocus={onFocusProp}
          onBlur={onBlurProp}
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
