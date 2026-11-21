"use client";

import { OrgCatalogManager } from "@/components/cloud/OrgCatalogManager";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";

export default function OrgProjectsPage() {
  const { orgId, canManage, setError } = useOrgWorkspace();
  return (
    <OrgCatalogManager
      orgId={orgId}
      section="projects"
      canManage={canManage}
      setError={setError}
    />
  );
}
