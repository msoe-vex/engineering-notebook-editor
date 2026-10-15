"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy team path → setup or members. */
export default function TeamRedirect() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  useEffect(() => {
    const base = `/orgs/${orgId}/notebooks/${notebookId}`;
    router.replace(tabParam === "members" ? `${base}/members` : `${base}/setup`);
  }, [orgId, notebookId, tabParam, router]);

  return null;
}
