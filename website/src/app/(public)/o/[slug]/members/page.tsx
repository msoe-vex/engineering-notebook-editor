"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicOrgChrome, type PublicNavSections } from "@/components/public/PublicOrgChrome";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicMembersPage() {
  const slug = String(useParams().slug || "");
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
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
          members?: Array<Record<string, unknown>>;
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
          if (!nav.members) {
            setSectionOff(true);
            setMembers([]);
          } else {
            setMembers(d.members || []);
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
      active="members"
      sections={sections}
    >
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <h1 className="text-3xl font-bold">Members</h1>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {members.map((m) => (
            <li key={String(m.id)} className="flex gap-3 rounded-xl border border-nb-outline-variant/30 p-4">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-nb-surface-low">
                {typeof m.imageUrl === "string" && m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{String(m.name || "Member")}</p>
                <p className="text-sm text-nb-on-surface-variant">
                  {[m.title || m.role, m.status === "alumni" ? "Alumni" : null]
                    .filter(Boolean)
                    .map(String)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {members.length === 0 && (
          <p className="mt-8 text-nb-on-surface-variant">No public members yet.</p>
        )}
      </main>
    </PublicOrgChrome>
  );
}
