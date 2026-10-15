"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RedirectInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(
      `/orgs/${orgId}/notebooks/${notebookId}/schedule${qs ? `?${qs}` : ""}`
    );
  }, [orgId, notebookId, router, searchParams]);

  return null;
}

/** Legacy calendar path → schedule. */
export default function CalendarRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
