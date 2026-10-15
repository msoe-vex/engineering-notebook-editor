"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "primary" | "tertiary" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-nb px-2 py-0.5 text-nb-caption font-semibold",
        tone === "neutral" && "bg-nb-surface-low text-nb-on-surface-variant",
        tone === "primary" && "bg-nb-primary/10 text-nb-primary",
        tone === "tertiary" && "bg-nb-tertiary/10 text-nb-tertiary",
        tone === "danger" && "bg-nb-danger/10 text-nb-danger",
        className
      )}
    >
      {children}
    </span>
  );
}

export function RoleChip({ role }: { role: string }) {
  const tone =
    role === "owner" || role === "service_admin"
      ? "primary"
      : role === "admin"
        ? "tertiary"
        : "neutral";
  return <Badge tone={tone}>{role}</Badge>;
}
