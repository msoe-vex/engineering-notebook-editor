import React, { useState, useLayoutEffect, useRef } from "react";
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
}

/**
 * A controlled input component for Tiptap/ProseMirror NodeViews that maintains
 * exact cursor positioning when typing in the middle of a string across editor transactions.
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
}: NodeViewInputProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(value || "");
  }
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const cursorPositionRef = useRef<number | null>(null);
  const showError = required && !localValue.trim();

  useLayoutEffect(() => {
    if (
      cursorPositionRef.current !== null &&
      inputRef.current &&
      document.activeElement === inputRef.current
    ) {
      inputRef.current.setSelectionRange(
        cursorPositionRef.current,
        cursorPositionRef.current
      );
      cursorPositionRef.current = null;
    }
  });

  useLayoutEffect(() => {
    if (!multiline) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [localValue, multiline]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    cursorPositionRef.current = e.target.selectionStart;
    setLocalValue(nextValue);
    onUpdate(nextValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (multiline) e.stopPropagation();
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
          placeholder={placeholder}
          className={fieldClassName}
          style={style}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          style={style}
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
