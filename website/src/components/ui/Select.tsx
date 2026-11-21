"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  label,
  error,
  className,
  containerClassName,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  error?: string;
  children: ReactNode;
  containerClassName?: string;
}) {
  const selectId =
    id || (typeof label === "string" ? label.replace(/\s+/g, "-").toLowerCase() : undefined);
  return (
    <div className={cn("w-full", containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1 block text-xs font-medium text-nb-on-surface-variant"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          "w-full rounded-xl border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2.5 text-sm text-nb-on-surface outline-none transition-colors focus:border-nb-primary disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-nb-danger",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-nb-danger">{error}</p>}
    </div>
  );
}
