import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import ValidationTooltip from "../ui/ValidationTooltip";

interface NodeViewInputProps {
  value: string;
  onUpdate: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  required?: boolean;
  missingMessage?: string;
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
}: NodeViewInputProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorPositionRef = useRef<number | null>(null);
  const showError = required && !localValue.trim();

  // Sync with external value changes (e.g. entry switches, undo/redo)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalValue(value || "");
    }
  }, [value]);

  // Restore cursor position synchronously before browser paint after ProseMirror transaction
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    cursorPositionRef.current = e.target.selectionStart;
    setLocalValue(nextValue);
    onUpdate(nextValue);
  };

  const wrapperClass = className?.includes("w-full")
    ? "w-full flex items-center justify-center gap-1.5"
    : className?.includes("flex-1")
      ? "flex-1 min-w-0 flex items-center gap-1.5"
      : "inline-flex items-center gap-1.5 min-w-0";

  return (
    <div className={wrapperClass}>
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
        style={style}
      />
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
