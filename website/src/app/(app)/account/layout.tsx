"use client";

import type { ReactNode } from "react";
import { AccountShell } from "@/components/cloud/AccountShell";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
