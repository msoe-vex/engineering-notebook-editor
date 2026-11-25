"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export function Checkbox({
  label,
  className,
  id,
  disabled,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
}) {
  const inputId =
    id || (typeof label === "string" ? `chk-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-nb-body text-nb-on-surface",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className="peer sr-only"
          {...rest}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border border-nb-outline-variant bg-nb-surface text-white transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-nb-primary/40",
            "peer-checked:border-nb-primary peer-checked:bg-nb-primary",
            "peer-checked:[&_svg]:opacity-100"
          )}
        >
          <Check size={12} strokeWidth={3} className="opacity-0 transition-opacity" />
        </span>
      </span>
      {label}
    </label>
  );
}
