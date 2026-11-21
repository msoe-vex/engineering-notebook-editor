"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

type PublicNotebookPayload = {
  org: { name: string; slug?: string };
  notebook: {
    name: string;
    title?: string;
    subtitle?: string;
    publicAccess?: string;
    lastCompiled?: string;
    publicExportId?: string | null;
  };
  pdfUrl?: string;
  noindex?: boolean;
};

export default function PublicNotebookPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const publicKey = String(params.publicKey || "");
  const [data, setData] = useState<PublicNotebookPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex";
      meta.dataset.enePublicNb = "1";
      document.head.appendChild(meta);
      return () => {
        document.querySelectorAll('meta[data-ene-public-nb="1"]').forEach((n) => n.remove());
      };
    }
  }, []);

  useEffect(() => {
    void cloudApi
      .getPublicNotebook(slug, publicKey)
      .then((d) => {
        const payload = d as PublicNotebookPayload;
        setData(payload);
        if (payload.pdfUrl) {
          setPdfUrl(payload.pdfUrl);
        } else {
          void cloudApi
            .getPublicNotebookPdf(slug, publicKey)
            .then((r) => setPdfUrl(r.url))
            .catch(() => setPdfUrl(null));
        }
        if (payload.noindex === false && typeof document !== "undefined") {
          document.querySelectorAll('meta[data-ene-public-nb="1"]').forEach((n) => n.remove());
        }
      })
      .catch((e) => setError((e as Error).message || "Not found"));
  }, [slug, publicKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-nb-surface text-nb-on-surface">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3 px-6 py-6">
        <div className="min-w-0">
          <Link href={`/o/${slug}`} className="text-sm font-semibold text-nb-primary hover:underline">
            ← {data.org.name}
          </Link>
          <h1 className="mt-2 truncate text-3xl font-bold tracking-tight">
            {data.notebook.title || data.notebook.name}
          </h1>
          {data.notebook.subtitle && (
            <p className="mt-1 text-nb-on-surface-variant">{data.notebook.subtitle}</p>
          )}
          {data.noindex && (
            <p className="mt-2 text-xs text-nb-on-surface-variant">
              Unlisted link — not for search engines.
            </p>
          )}
        </div>
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm font-semibold text-nb-primary hover:underline"
          >
            Download PDF
          </a>
        )}
      </header>

      <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 px-6 pb-10">
        {pdfUrl ? (
          <iframe
            title="Compiled notebook PDF"
            src={pdfUrl}
            className="h-[min(80vh,900px)] w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low"
          />
        ) : (
          <Alert variant="warning">
            No compiled PDF is published for this notebook yet.
          </Alert>
        )}
      </main>
    </div>
  );
}
