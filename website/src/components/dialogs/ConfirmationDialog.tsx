"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Dialog } from "@/components/ui";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
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
}: ConfirmationDialogProps) {
  const iconTone =
    variant === "danger"
      ? "bg-nb-danger/10 text-nb-danger"
      : variant === "warning"
        ? "bg-nb-warning/10 text-nb-warning"
        : "bg-nb-primary/10 text-nb-primary";

  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="mb-6 flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          <AlertTriangle size={20} />
        </div>
        <p className="text-xs font-medium leading-relaxed whitespace-pre-line text-nb-on-surface-variant">
          {message}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "info" ? "primary" : "danger"}
          className={
            variant === "danger"
              ? "flex-1 border-0 bg-nb-danger text-white hover:bg-nb-danger-dim"
              : variant === "warning"
                ? "flex-1 border-0 bg-nb-warning text-white hover:opacity-90"
                : "flex-1"
          }
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
