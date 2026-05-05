"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";

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
  variant = "danger"
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      iconBg: "bg-red-500/10",
      iconColor: "text-red-500",
      confirmBg: "bg-red-500 hover:bg-red-600 shadow-red-500/20",
    },
    warning: {
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      confirmBg: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20",
    },
    info: {
      iconBg: "bg-nb-primary/10",
      iconColor: "text-nb-primary",
      confirmBg: "bg-nb-primary hover:bg-nb-primary-dim shadow-nb-primary/20",
    }
  };

  const style = variantStyles[variant];

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-300"
      onClick={onCancel}
    >
      <div 
        className="relative w-full max-w-sm bg-nb-surface border border-nb-outline-variant/30 rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-12 h-12 rounded-2xl ${style.iconBg} ${style.iconColor} flex items-center justify-center shrink-0`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">{title}</h3>
              <div className="h-0.5 w-8 bg-nb-outline-variant/30 mt-1" />
            </div>
            <button 
              onClick={onCancel}
              className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-nb-on-surface-variant font-medium leading-relaxed mb-8">
            {message}
          </p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-2xl border border-nb-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low transition-all active:scale-95"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-3 rounded-2xl ${style.confirmBg} text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
