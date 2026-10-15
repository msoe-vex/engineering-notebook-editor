"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/ui";

/** Settings moved to user Account — keep route for old links. */
export default function NotebookSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account");
  }, [router]);
  return <LoadingBlock label="Opening account…" />;
}
