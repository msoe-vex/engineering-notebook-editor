"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Dialog, TextField } from "@/components/ui";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
  confirmText?: string;
  confirmTextPlaceholder?: string;
  size?: "sm" | "md" | "xl";
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "danger",
  confirmText,
  confirmTextPlaceholder,
  size = "md",
}: ConfirmationDialogProps) {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    if (isOpen) setTypedText("");
  }, [isOpen]);

  const iconTone =
    variant === "danger"
      ? "bg-nb-danger/10 text-nb-danger"
      : variant === "warning"
        ? "bg-nb-warning/10 text-nb-warning"
        : "bg-nb-primary/10 text-nb-primary";

  const canConfirm = !confirmText || typedText.trim() === confirmText.trim();

  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title} size={size}>
      <div className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          <AlertTriangle size={20} />
        </div>
        <p className="text-xs font-medium leading-relaxed whitespace-pre-line text-nb-on-surface-variant">
          {message}
        </p>
      </div>

      {confirmText && (
        <div className="mb-6 flex flex-col gap-1.5">
          <label className="text-nb-caption text-nb-on-surface">
            Please type <strong className="font-mono text-nb-on-surface bg-nb-surface-low px-1.5 py-0.5 rounded border border-nb-outline-variant/30 select-all">{confirmText}</strong> to confirm:
          </label>
          <TextField
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={confirmTextPlaceholder || confirmText}
            autoFocus
          />
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1 whitespace-nowrap" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "info" ? "primary" : "danger"}
          disabled={!canConfirm}
          className={
            variant === "danger"
              ? "flex-1 border-0 bg-nb-danger text-white hover:bg-nb-danger-dim disabled:opacity-40 whitespace-nowrap"
              : variant === "warning"
                ? "flex-1 border-0 bg-nb-warning text-white hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                : "flex-1 disabled:opacity-40 whitespace-nowrap"
          }
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
