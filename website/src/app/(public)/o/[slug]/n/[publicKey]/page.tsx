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
  };
  entries: Array<{ id: string; title?: string; date?: string; phase?: string }>;
  contributors: Array<{ id: string; name?: string; role?: string }>;
  noindex?: boolean;
};

export default function PublicNotebookPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const publicKey = String(params.publicKey || "");
  const [data, setData] = useState<PublicNotebookPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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
        if (payload.noindex === false && typeof document !== "undefined") {
          document.querySelectorAll('meta[data-ene-public-nb="1"]').forEach((n) => n.remove());
        }
      })
      .catch((e) => setError((e as Error).message || "Not found"));
  }, [slug, publicKey]);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { url } = await cloudApi.getPublicNotebookPdf(slug, publicKey);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("No compiled PDF available yet.");
    } finally {
      setPdfBusy(false);
    }
  }

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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/o/${slug}`} className="text-sm text-nb-primary">
        ← {data.org.name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{data.notebook.title || data.notebook.name}</h1>
      {data.notebook.subtitle && (
        <p className="mt-2 text-nb-on-surface-variant">{data.notebook.subtitle}</p>
      )}
      {data.noindex && (
        <p className="mt-2 text-xs text-nb-on-surface-variant">Unlisted link — not for search engines.</p>
      )}

      {data.notebook.lastCompiled && (
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => void downloadPdf()}
          className="mt-4 rounded-lg border border-nb-outline-variant/40 px-3 py-1.5 text-sm font-semibold text-nb-primary hover:bg-nb-surface-low disabled:opacity-60"
        >
          {pdfBusy ? "Opening…" : "Download last PDF"}
        </button>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Entries</h2>
        <ul className="mt-4 space-y-2">
          {data.entries.map((e) => (
            <li key={e.id}>
              <Link
                href={`/o/${slug}/n/${publicKey}/entries/${e.id}`}
                className="font-medium text-nb-primary hover:underline"
              >
                {e.title || e.id}
              </Link>
              <span className="text-sm text-nb-on-surface-variant">
                {" "}
                {[e.date, e.phase].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        {data.entries.length === 0 && (
          <p className="mt-4 text-nb-on-surface-variant">No entries.</p>
        )}
      </section>

      {data.contributors.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Contributors</h2>
          <ul className="mt-3 flex flex-wrap gap-3 text-sm">
            {data.contributors.map((c) => (
              <li key={c.id} className="rounded-full border border-nb-outline-variant/30 px-3 py-1">
                {c.name}
                {c.role ? ` · ${c.role}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
