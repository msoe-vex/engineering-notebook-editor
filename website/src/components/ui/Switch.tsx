"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
  id,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: ReactNode;
}) {
  const switchId =
    id || (typeof label === "string" ? `sw-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nb-primary disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-nb-primary" : "bg-nb-outline-variant/50"
        )}
        {...rest}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4"
          )}
        />
      </button>
      {label && (
        <label htmlFor={switchId} className="cursor-pointer text-nb-body text-nb-on-surface">
          {label}
        </label>
      )}
    </div>
  );
}
