"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Alias — grades overview lives at `/judge`. */
export default function JudgeGradesRedirectPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; notebookId: string }>();

  useEffect(() => {
    router.replace(`/orgs/${params.orgId}/notebooks/${params.notebookId}/judge`);
  }, [router, params.orgId, params.notebookId]);

  return null;
}
