"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicOrgChrome, type PublicNavSections } from "@/components/public/PublicOrgChrome";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicProjectsPage() {
  const slug = String(useParams().slug || "");
  const [projects, setProjects] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [sections, setSections] = useState<PublicNavSections | undefined>();
  const [sectionOff, setSectionOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then(
        (d: {
          org?: {
            name?: string;
            logoUrl?: string;
            publicPage?: { sections?: { projects?: boolean; events?: boolean; members?: boolean } };
          };
          projects?: Array<Record<string, unknown>>;
        }) => {
          const secs = d.org?.publicPage?.sections;
          const nav = {
            projects: secs?.projects !== false,
            events: secs?.events !== false,
            members: secs?.members !== false,
          };
          setName(d.org?.name || slug);
          setLogoUrl(d.org?.logoUrl);
          setSections(nav);
          if (!nav.projects) {
            setSectionOff(true);
            setProjects([]);
          } else {
            setProjects(d.projects || []);
          }
          setReady(true);
        }
      )
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  if (error || sectionOff) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Alert variant="error">{error || "Not found"}</Alert>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <PublicOrgChrome
      slug={slug}
      orgName={name}
      logoUrl={logoUrl}
      active="projects"
      sections={sections}
    >
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <h1 className="text-3xl font-bold">Projects & Robot Builds</h1>
        <ul className="mt-8 space-y-6">
          {projects.map((p) => (
            <li key={String(p.id)} className="flex gap-4 border-b border-nb-outline-variant/20 pb-6">
              {typeof p.imageUrl === "string" && p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-nb-lg object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  {p.season ? `${String(p.season)} ` : ""}
                  {String(p.title || "Project")}
                </h2>
                {p.summary ? (
                  <p className="mt-2 text-nb-on-surface-variant">{String(p.summary)}</p>
                ) : null}
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
              </div>
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
