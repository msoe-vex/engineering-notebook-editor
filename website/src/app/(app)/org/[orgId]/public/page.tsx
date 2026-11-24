"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { LoadingBlock } from "@/components/ui";

/** Public CMS moved into Settings + Donors/Projects/Events tabs. */
export default function OrgPublicRedirectPage() {
  const { orgId } = useOrgWorkspace();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/org/${orgId}/settings`);
  }, [orgId, router]);

  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <LoadingBlock label="Redirecting to Settings…" />
    </div>
  );
}
