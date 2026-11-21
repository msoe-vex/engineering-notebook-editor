"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Checkbox({
  label,
  className,
  id,
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
        rest.disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-nb-outline-variant text-nb-primary focus:ring-nb-primary"
        {...rest}
      />
      {label}
    </label>
  );
}
