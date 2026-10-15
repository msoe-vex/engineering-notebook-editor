"use client";

import type { ReactNode } from "react";
import { NotebookShell } from "@/components/cloud/NotebookShell";

export default function NotebookLayout({ children }: { children: ReactNode }) {
  return <NotebookShell>{children}</NotebookShell>;
}
