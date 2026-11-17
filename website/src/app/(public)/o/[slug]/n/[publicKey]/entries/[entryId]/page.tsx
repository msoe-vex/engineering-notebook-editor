"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { PublicTipTapViewer } from "@/components/cloud/PublicTipTapViewer";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicEntryPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const publicKey = String(params.publicKey || "");
  const entryId = String(params.entryId || "");
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicEntry(slug, publicKey, entryId)
      .then((d: { entry?: { title?: string }; tipTapJson?: unknown }) => {
        setTitle(d.entry?.title || entryId);
        setDoc((d.tipTapJson as Record<string, unknown>) || null);
        setLoaded(true);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug, publicKey, entryId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/o/${slug}/n/${publicKey}`} className="text-sm text-nb-primary">
        ← Notebook
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{title}</h1>
      <article className="mt-8 rounded-xl border border-nb-outline-variant/20 bg-nb-surface p-6">
        {doc ? (
          <PublicTipTapViewer doc={doc} />
        ) : (
          <p className="text-nb-on-surface-variant">(Empty entry)</p>
        )}
      </article>
    </div>
  );
}
