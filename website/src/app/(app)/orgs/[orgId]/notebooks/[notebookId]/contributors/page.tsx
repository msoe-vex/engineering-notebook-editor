"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Alias: Contributors lives at /members. */
export default function ContributorsRedirect() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);

  useEffect(() => {
    router.replace(`/orgs/${orgId}/notebooks/${notebookId}/members`);
  }, [orgId, notebookId, router]);

  return null;
}
