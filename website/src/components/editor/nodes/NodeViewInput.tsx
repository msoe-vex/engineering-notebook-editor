import React, { useState, useEffect, useLayoutEffect, useRef } from "react";

interface NodeViewInputProps {
  value: string;
  onUpdate: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
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
}: NodeViewInputProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorPositionRef = useRef<number | null>(null);

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

  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      style={style}
    />
  );
}
