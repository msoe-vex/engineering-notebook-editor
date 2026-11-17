"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cloudApi } from "@/lib/cloud/api";
import { LoadingBlock } from "@/components/ui";
import { Alert } from "@/components/ui/Alert";

export default function PublicEventsPage() {
  const slug = String(useParams().slug || "");
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cloudApi
      .getPublicOrg(slug)
      .then((d: { org?: { name?: string }; events?: Array<Record<string, unknown>> }) => {
        setName(d.org?.name || slug);
        setEvents(d.events || []);
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
      <h1 className="mt-4 text-3xl font-bold">Events & Calendar</h1>
      <ul className="mt-8 space-y-3">
        {events.map((e) => (
          <li key={String(e.id)} className="rounded-lg border border-nb-outline-variant/30 px-4 py-3">
            <p className="font-semibold">{String(e.title || "Event")}</p>
            <p className="text-sm text-nb-on-surface-variant">
              {[e.date || e.day, e.time, e.location].filter(Boolean).map(String).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {events.length === 0 && <p className="mt-8 text-nb-on-surface-variant">No events published yet.</p>}
    </div>
  );
}
