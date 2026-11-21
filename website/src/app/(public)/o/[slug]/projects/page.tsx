"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicOrgChrome } from "@/components/public/PublicOrgChrome";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicProjectsPage() {
  const slug = String(useParams().slug || "");
  const [projects, setProjects] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then(
        (d: {
          org?: { name?: string; logoUrl?: string };
          projects?: Array<Record<string, unknown>>;
        }) => {
          setName(d.org?.name || slug);
          setLogoUrl(d.org?.logoUrl);
          setProjects(d.projects || []);
        }
      )
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
    <PublicOrgChrome slug={slug} orgName={name} logoUrl={logoUrl} active="projects">
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <h1 className="text-3xl font-bold">Projects & Robot Builds</h1>
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
        {projects.length === 0 && (
          <p className="mt-8 text-nb-on-surface-variant">No projects published yet.</p>
        )}
      </main>
    </PublicOrgChrome>
  );
}
