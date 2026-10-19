import type { ReactNode } from "react";

/** Shared action item for DropdownMenu and ContextMenu. */
export type MenuItem = {
  id: string;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** When true, render a horizontal rule; other fields are ignored. */
  separator?: boolean;
  onSelect?: () => void;
};
