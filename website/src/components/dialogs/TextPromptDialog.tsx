"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, TextField } from "@/components/ui";

interface TextPromptDialogProps {
  isOpen: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function TextPromptDialog({
  isOpen,
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title}>
      <TextField
        label={label}
        placeholder={placeholder}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.trim()) onConfirm(value.trim());
          }
          if (e.key === "Escape") onCancel();
        }}
        className="mb-6"
      />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!value.trim()}
          onClick={() => onConfirm(value.trim())}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
