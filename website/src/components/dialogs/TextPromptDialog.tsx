"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface TextPromptDialogProps {
  isOpen: boolean;
  title: string;
  label?: string;
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-[24px] border border-nb-outline-variant/30 bg-nb-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-nb-on-surface">{title}</h3>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl p-2 text-nb-on-surface-variant/40 hover:bg-nb-surface-low hover:text-nb-on-surface"
            >
              <X size={18} />
            </button>
          </div>
          {label && (
            <label className="mb-1 block text-xs font-medium text-nb-on-surface-variant">{label}</label>
          )}
          <input
            autoFocus
            className="mb-6 w-full rounded-xl border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2 text-sm text-nb-on-surface outline-none focus:border-nb-primary"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.trim()) onConfirm(value.trim());
              }
              if (e.key === "Escape") onCancel();
            }}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-nb-outline-variant/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={!value.trim()}
              onClick={() => onConfirm(value.trim())}
              className="flex-1 rounded-xl bg-nb-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
