"use client";

import { OrgCatalogManager } from "@/components/cloud/OrgCatalogManager";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";

export default function OrgEventsPage() {
  const { orgId, canManage, setError } = useOrgWorkspace();
  return (
    <OrgCatalogManager
      orgId={orgId}
      section="events"
      canManage={canManage}
      setError={setError}
    />
  );
}
