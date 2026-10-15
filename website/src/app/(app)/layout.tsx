"use client";

import type { ReactNode } from "react";
import { CloudShell } from "@/components/cloud/CloudShell";

/** Auth chrome for org / notebook / admin routes (URLs unchanged; `(app)` is a route group). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <CloudShell>{children}</CloudShell>;
}
