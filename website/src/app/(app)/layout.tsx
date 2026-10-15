"use client";

import type { ReactNode } from "react";
import { AppChrome } from "@/components/cloud/AppChrome";

/** Auth chrome for org / notebook / admin routes (URLs unchanged; `(app)` is a route group). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
