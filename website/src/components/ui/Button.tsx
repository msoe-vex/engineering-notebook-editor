"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-nb-primary text-white hover:bg-nb-primary-dim shadow-nb-sm disabled:opacity-40",
  secondary:
    "border border-nb-outline-variant/40 bg-nb-surface text-nb-on-surface hover:bg-nb-surface-low",
  ghost: "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface",
  danger:
    "border border-nb-danger/40 text-nb-danger hover:bg-nb-danger/10 disabled:opacity-40",
  link: "text-nb-tertiary hover:underline px-0 py-0 h-auto",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-nb-label gap-1.5",
  md: "px-4 py-2 text-nb-body gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-nb-lg font-semibold transition-colors disabled:cursor-not-allowed",
        variant !== "link" && sizeClass[size],
        variantClass[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
