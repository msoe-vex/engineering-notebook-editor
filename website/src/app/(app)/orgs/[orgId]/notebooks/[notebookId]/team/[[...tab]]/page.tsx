"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import TeamEditor from "@/components/pages/TeamEditor";
import type { TeamTab } from "@/lib/types";

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = useMemo((): TeamTab => {
    return tabParam === "members" || tabParam === "phases" || tabParam === "identity"
      ? tabParam
      : "identity";
  }, [tabParam]);

  return (
    <TeamEditor
      initialTab={initialTab}
      onTabChange={(tab) => {
        router.replace(`/orgs/${orgId}/notebooks/${notebookId}/team/${tab}`);
      }}
      onClose={() => router.push(`/orgs/${orgId}/notebooks/${notebookId}`)}
    />
  );
}
