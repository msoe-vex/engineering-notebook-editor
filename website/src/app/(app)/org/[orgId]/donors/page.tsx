"use client";

import { OrgCatalogManager } from "@/components/cloud/OrgCatalogManager";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";

export default function OrgDonorsPage() {
  const { orgId, canManage, setError } = useOrgWorkspace();
  return (
    <OrgCatalogManager
      orgId={orgId}
      section="donors"
      canManage={canManage}
      setError={setError}
    />
  );
}
