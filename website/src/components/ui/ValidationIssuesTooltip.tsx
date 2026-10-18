"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "./cn";

export function ValidationIssuesTooltip({
  errors,
  className,
  triggerClassName,
  onClick,
  children,
  ...rest
}: {
  errors: string[];
  className?: string;
  triggerClassName?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "type">) {
  const list = errors.filter(Boolean);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const rect = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const pad = 8;
    const gap = 6;

    let top = rect.bottom + gap;
    let left = rect.right - tipRect.width;

    if (top + tipRect.height > window.innerHeight - pad && rect.top - gap - tipRect.height >= pad) {
      top = rect.top - tipRect.height - gap;
    }
    if (left < pad) left = pad;
    if (left + tipRect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - tipRect.width - pad);
    }
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open || list.length === 0) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition, list.length]);

  if (list.length === 0) return null;

  const label = `${list.length} validation issue${list.length === 1 ? "" : "s"}`;

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex shrink-0", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setCoords(null);
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false);
        setCoords(null);
      }}
    >
      <button
        type="button"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded text-nb-warning hover:bg-nb-warning/10",
          triggerClassName
        )}
        aria-label={label}
        onClick={onClick}
        {...rest}
      >
        {children ?? <AlertTriangle size={12} strokeWidth={2.25} />}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[9999] w-max max-w-[14rem] rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-left shadow-nb-lg"
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            <ul className="space-y-0.5">
              {list.map((err) => (
                <li key={err} className="text-[11px] leading-snug text-nb-on-surface">
                  {err}
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </span>
  );
}
