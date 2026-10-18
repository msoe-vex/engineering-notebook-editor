import React from "react";

export const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title
}: {
  onClick: (e?: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string
}) => (
  <button
    type="button"
    onClick={(e) => !disabled && onClick(e)}
    disabled={disabled}
    title={title}
    className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg border p-2 transition-all cursor-pointer md:min-h-0 md:min-w-0 ${active
      ? "scale-105 border-nb-primary bg-nb-primary text-white shadow-md"
      : "border-transparent text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
      } ${disabled ? "cursor-not-allowed opacity-30 grayscale" : ""}`}
  >
    {children}
  </button>
);
