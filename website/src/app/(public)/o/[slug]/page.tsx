"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicOrgChrome } from "@/components/public/PublicOrgChrome";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

type PublicOrgPayload = {
  org: {
    id: string;
    name: string;
    slug?: string;
    logoUrl?: string;
    publicPage?: {
      visibility?: string;
      announcement?: { text: string; href?: string };
      about?: string;
      mission?: string;
      cta?: { title?: string; body?: string; joinUrl?: string; donateUrl?: string };
    };
  };
  donors: Array<{ id: string; name?: string; url?: string }>;
  projects: Array<{ id: string; title?: string; summary?: string; season?: string }>;
  events: Array<{ id: string; title?: string; location?: string; day?: string; time?: string; date?: string }>;
  members: Array<{ id: string; name?: string; role?: string; classYear?: string }>;
  social: Array<{ id: string; label?: string; url?: string }>;
};

export default function PublicOrgHomePage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const [data, setData] = useState<PublicOrgPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cloudApi
      .getPublicOrg(slug)
      .then((d) => {
        if (!cancelled) setData(d as PublicOrgPayload);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message || "Not found");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

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

  const { org, donors, projects, events, members, social } = data;
  const page = org.publicPage;
  const about = page?.about || page?.mission;

  return (
    <PublicOrgChrome slug={slug} orgName={org.name} logoUrl={org.logoUrl} active="home">
      {page?.announcement?.text && (
        <div className="border-b border-nb-outline-variant/30 bg-nb-surface-container px-4 py-2 text-center text-sm">
          {page.announcement.href ? (
            <a href={page.announcement.href} className="text-nb-primary hover:underline">
              {page.announcement.text}
            </a>
          ) : (
            page.announcement.text
          )}
        </div>
      )}
      <main className="mx-auto max-w-5xl space-y-12 px-6 pb-20">
        {about && (
          <section>
            <h2 className="text-xl font-semibold">About</h2>
            <p className="mt-2 text-nb-on-surface-variant">{about}</p>
          </section>
        )}
        {donors.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Our Donors</h2>
            <ul className="mt-4 flex flex-wrap gap-4">
              {donors.map((d) => (
                <li key={d.id} className="rounded-lg border border-nb-outline-variant/30 px-3 py-2">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="hover:text-nb-primary">
                      {d.name || d.id}
                    </a>
                  ) : (
                    d.name || d.id
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {projects.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Recent Projects</h2>
            <ul className="mt-4 space-y-4">
              {projects.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <p className="font-semibold">
                    {p.season ? `${p.season} ` : ""}
                    {p.title || "Project"}
                  </p>
                  {p.summary && <p className="text-sm text-nb-on-surface-variant">{p.summary}</p>}
                </li>
              ))}
            </ul>
            <Link href={`/o/${slug}/projects`} className="mt-3 inline-block text-sm text-nb-primary">
              View all projects →
            </Link>
          </section>
        )}
        {members.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Meet The Board</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {members.slice(0, 6).map((m) => (
                <li key={m.id} className="rounded-xl border border-nb-outline-variant/30 p-4">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-nb-on-surface-variant">
                    {[m.role, m.classYear].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            <Link href={`/o/${slug}/members`} className="mt-3 inline-block text-sm text-nb-primary">
              Full roster →
            </Link>
          </section>
        )}
        {events.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Upcoming</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {events.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.title}</span>
                  {(e.day || e.date || e.time || e.location) && (
                    <span className="text-nb-on-surface-variant">
                      {" — "}
                      {[e.date || e.day, e.time, e.location].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Link href={`/o/${slug}/events`} className="mt-3 inline-block text-sm text-nb-primary">
              Events →
            </Link>
          </section>
        )}
        {(page?.cta || social.length > 0) && (
          <section className="rounded-2xl border border-nb-outline-variant/30 p-6">
            <h2 className="text-xl font-semibold">{page?.cta?.title || "Get involved"}</h2>
            {page?.cta?.body && <p className="mt-2 text-nb-on-surface-variant">{page.cta.body}</p>}
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              {page?.cta?.joinUrl && (
                <a href={page.cta.joinUrl} className="text-nb-primary hover:underline">
                  Join
                </a>
              )}
              {page?.cta?.donateUrl && (
                <a href={page.cta.donateUrl} className="text-nb-primary hover:underline">
                  Donate
                </a>
              )}
              {social.map((s) => (
                <a key={s.id} href={s.url} className="text-nb-primary hover:underline">
                  {s.label || s.url}
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicOrgChrome>
  );
}
