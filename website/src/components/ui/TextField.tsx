"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function TextField({
  label,
  error,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string;
}) {
  const inputId = id || (typeof label === "string" ? label.replace(/\s+/g, "-").toLowerCase() : undefined);
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium text-nb-on-surface-variant"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full rounded-xl border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2.5 text-sm text-nb-on-surface outline-none transition-colors focus:border-nb-primary",
          error && "border-nb-danger",
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-nb-danger">{error}</p>}
    </div>
  );
}
