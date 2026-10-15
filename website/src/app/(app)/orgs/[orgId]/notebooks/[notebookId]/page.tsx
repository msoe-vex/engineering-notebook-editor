"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";

/** Notebook index: send to the first entry when one exists; otherwise empty state. */
export default function NotebookIndexPage() {
  const router = useRouter();
  const { orgId, notebookId, entries } = useNotebookWorkspace();

  useEffect(() => {
    const sorted = Object.entries(entries).sort((a, b) => a[1].order - b[1].order);
    if (!sorted.length) return;
    router.replace(`/orgs/${orgId}/notebooks/${notebookId}/entries/${sorted[0][0]}`);
  }, [entries, orgId, notebookId, router]);

  if (Object.keys(entries).length > 0) {
    return <p className="text-sm text-neutral-500">Opening entry…</p>;
  }

  return (
    <p className="text-sm text-neutral-500">
      No entries yet. Use the explorer <span className="font-medium">+</span> button to create one.
    </p>
  );
}
