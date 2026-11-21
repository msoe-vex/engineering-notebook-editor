"use client";

import type { ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export function TextArea({
  label,
  error,
  className,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  error?: string;
}) {
  const areaId =
    id || (typeof label === "string" ? label.replace(/\s+/g, "-").toLowerCase() : undefined);
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={areaId}
          className="mb-1 block text-xs font-medium text-nb-on-surface-variant"
        >
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        className={cn(
          "min-h-[6rem] w-full rounded-xl border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2.5 text-sm text-nb-on-surface outline-none transition-colors focus:border-nb-primary disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-nb-danger",
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-nb-danger">{error}</p>}
    </div>
  );
}
