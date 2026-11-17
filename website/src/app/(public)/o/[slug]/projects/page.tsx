"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicProjectsPage() {
  const slug = String(useParams().slug || "");
  const [projects, setProjects] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then((d: { org?: { name?: string }; projects?: Array<Record<string, unknown>> }) => {
        setName(d.org?.name || slug);
        setProjects(d.projects || []);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }
  if (!name && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/o/${slug}`} className="text-sm text-nb-primary">
        ← {name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Projects & Robot Builds</h1>
      <ul className="mt-8 space-y-6">
        {projects.map((p) => (
          <li key={String(p.id)} className="border-b border-nb-outline-variant/20 pb-6">
            <h2 className="text-xl font-semibold">
              {p.season ? `${String(p.season)} ` : ""}
              {String(p.title || "Project")}
            </h2>
            {p.summary ? <p className="mt-2 text-nb-on-surface-variant">{String(p.summary)}</p> : null}
            {Array.isArray(p.highlights) && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(p.highlights as string[]).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            {p.externalUrl ? (
              <a
                href={String(p.externalUrl)}
                className="mt-2 inline-block text-sm text-nb-primary"
                target="_blank"
                rel="noreferrer"
              >
                Source / CAD ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {projects.length === 0 && <p className="mt-8 text-nb-on-surface-variant">No projects published yet.</p>}
    </div>
  );
}
