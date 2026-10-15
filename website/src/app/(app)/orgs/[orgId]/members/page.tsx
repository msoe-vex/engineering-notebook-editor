"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy route — People tab. */
export default function OrgMembersRedirect() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId);
  useEffect(() => {
    router.replace(`/orgs/${orgId}/people`);
  }, [orgId, router]);
  return null;
}
