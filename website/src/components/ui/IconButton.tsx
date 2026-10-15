"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function IconButton({
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "danger";
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
        variant === "ghost" &&
          "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface",
        variant === "danger" && "text-nb-danger hover:bg-nb-danger/10",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
