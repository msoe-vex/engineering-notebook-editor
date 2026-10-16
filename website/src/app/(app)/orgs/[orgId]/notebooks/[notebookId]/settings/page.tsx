"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/ui";

/** Alias: notebook Settings lives at /setup. */
export default function NotebookSettingsRedirect() {
  const router = useRouter();
  const params = useParams();
  const orgId = String(params.orgId || "");
  const notebookId = String(params.notebookId || "");

  useEffect(() => {
    if (orgId && notebookId) {
      router.replace(`/orgs/${orgId}/notebooks/${notebookId}/setup`);
    }
  }, [router, orgId, notebookId]);

  return <LoadingBlock label="Opening notebook settings…" />;
}
