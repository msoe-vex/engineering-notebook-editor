"use client";

import { CheckCircle2, AlertCircle, AlertTriangle, Loader2, Info, X } from "lucide-react";
import toast from "react-hot-toast";
import { events, EventNames } from "@/lib/events";

export type NotificationType = "success" | "error" | "warning" | "loading" | "info";

interface NotificationProps {
  message: string;
  type: NotificationType;
  t: { visible: boolean; id: string };
  action?: { label: string; onClick: () => void };
}

export function Notification({ message, type, t, action }: NotificationProps) {
  const icons = {
    success: <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />,
    error: <AlertCircle className="text-red-600 dark:text-red-400" size={18} />,
    warning: <AlertTriangle className="text-amber-600 dark:text-amber-400" size={18} />,
    loading: <Loader2 className="text-nb-primary animate-spin" size={18} />,
    info: <Info className="text-nb-tertiary" size={18} />,
  };

  const bgColors = {
    success: "bg-emerald-500/10 dark:bg-emerald-500/20",
    error: "bg-red-500/10 dark:bg-red-500/20",
    warning: "bg-amber-500/10 dark:bg-amber-500/20",
    loading: "bg-nb-primary/10 dark:bg-nb-primary/20",
    info: "bg-nb-tertiary/10 dark:bg-nb-tertiary/20",
  };

  return (
    <div
      className={`${
        t.visible
          ? "animate-in fade-in slide-in-from-right-4"
          : "animate-out fade-out slide-out-to-right-4"
      } pointer-events-auto flex max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-nb-surface shadow-nb-2xl`}
    >
      <div
        className={`w-1.5 shrink-0 ${
          type === "success"
            ? "bg-green-500"
            : type === "error"
              ? "bg-red-500"
              : type === "warning"
                ? "bg-amber-500"
                : type === "info"
                  ? "bg-nb-tertiary"
                  : "bg-nb-primary"
        }`}
      />

      <div className="flex min-w-0 flex-1 items-start gap-3 p-4">
        <div className={`shrink-0 rounded-xl p-2 ${bgColors[type]}`}>{icons[type]}</div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="mb-0.5 text-xs font-black uppercase tracking-wider text-nb-on-surface">
            {type === "loading" ? "Processing" : type.toUpperCase()}
          </p>
          <div className="custom-scrollbar max-h-48 overflow-y-auto text-xs font-medium leading-relaxed wrap-break-word select-text text-nb-on-surface-variant">
            {message}
          </div>
          {action ? (
            <button
              type="button"
              className="mt-2 text-xs font-bold text-nb-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                toast.remove(t.id);
              }}
            >
              {action.label}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toast.remove(t.id);
          }}
          className="z-10 shrink-0 cursor-pointer rounded-lg p-1 text-nb-on-surface-variant/30 transition-all hover:bg-nb-surface-low hover:text-nb-on-surface"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export interface NotificationOptions {
  duration?: number;
  persistent?: boolean;
  action?: { label: string; onClick: () => void };
}

export function showNotification(
  message: string,
  type: NotificationType = "info",
  options?: NotificationOptions
) {
  let duration: number;
  if (options?.persistent) {
    duration = Infinity;
  } else if (options?.duration !== undefined) {
    duration = options.duration;
  } else if (type === "loading") {
    duration = Infinity;
  } else if (options?.action) {
    duration = 10000;
  } else {
    duration = 4000;
  }

  return toast.custom(
    (t) => (
      <Notification message={message} type={type} t={t} action={options?.action} />
    ),
    { duration }
  );
}

/** Bridge `SHOW_NOTIFICATION` events (and direct callers) to react-hot-toast. */
export function bindNotificationEvents(): () => void {
  return events.on(EventNames.SHOW_NOTIFICATION, (data) => {
    const payload = data as { message?: string; type?: NotificationType } | undefined;
    if (!payload?.message) return;
    showNotification(payload.message, payload.type ?? "info");
  });
}
