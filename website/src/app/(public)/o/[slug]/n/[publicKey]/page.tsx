"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

/** Public notebook links redirect straight to the signed PDF — no wrapper UI. */
export default function PublicNotebookPdfRedirectPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const publicKey = String(params.publicKey || "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cloudApi
      .getPublicNotebookPdf(slug, publicKey)
      .then((r) => {
        if (cancelled) return;
        window.location.replace(r.url);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message || "Not found");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, publicKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingBlock />
    </div>
  );
}
