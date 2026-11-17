"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicMembersPage() {
  const slug = String(useParams().slug || "");
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then((d: { org?: { name?: string }; members?: Array<Record<string, unknown>> }) => {
        setName(d.org?.name || slug);
        setMembers(d.members || []);
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
  if (!name) {
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
      <h1 className="mt-4 text-3xl font-bold">Members</h1>
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
                {[m.role, m.classYear].filter(Boolean).map(String).join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {members.length === 0 && <p className="mt-8 text-nb-on-surface-variant">No public members yet.</p>}
    </div>
  );
}
