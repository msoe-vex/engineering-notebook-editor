"use client";

import { useRouter } from "next/navigation";
import SettingsPage from "@/components/pages/SettingsPage";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";

export default function NotebookSettingsPage() {
  const router = useRouter();
  const { orgId, notebookId } = useNotebookWorkspace();

  return (
    <SettingsPage
      isEmbedded
      onClose={() => router.push(`/orgs/${orgId}/notebooks/${notebookId}`)}
    />
  );
}
