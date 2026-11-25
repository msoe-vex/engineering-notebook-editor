"use client";

import type { ReactNode } from "react";
import { AppChrome } from "@/components/cloud/AppChrome";
import { SessionProvider } from "@/lib/auth/sessionContext";

/** Auth chrome for org / notebook / admin routes (URLs unchanged; `(app)` is a route group). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppChrome>{children}</AppChrome>
    </SessionProvider>
  );
}
