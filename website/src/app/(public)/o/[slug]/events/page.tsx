"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicOrgChrome } from "@/components/public/PublicOrgChrome";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicEventsPage() {
  const slug = String(useParams().slug || "");
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then(
        (d: {
          org?: { name?: string; logoUrl?: string };
          events?: Array<Record<string, unknown>>;
        }) => {
          setName(d.org?.name || slug);
          setLogoUrl(d.org?.logoUrl);
          setEvents(d.events || []);
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
  if (!name) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <PublicOrgChrome slug={slug} orgName={name} logoUrl={logoUrl} active="events">
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <h1 className="text-3xl font-bold">Events & Calendar</h1>
        <ul className="mt-8 space-y-3">
          {events.map((e) => (
            <li
              key={String(e.id)}
              className="flex items-start gap-3 rounded-lg border border-nb-outline-variant/30 px-4 py-3"
            >
              {typeof e.imageUrl === "string" && e.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-nb-md object-cover"
                />
              ) : null}
              <div>
                <p className="font-semibold">{String(e.title || "Event")}</p>
                <p className="text-sm text-nb-on-surface-variant">
                  {[e.date || e.day, e.time, e.location].filter(Boolean).map(String).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {events.length === 0 && (
          <p className="mt-8 text-nb-on-surface-variant">No events published yet.</p>
        )}
      </main>
    </PublicOrgChrome>
  );
}
