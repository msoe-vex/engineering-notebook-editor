"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi } from "@/lib/cloud/api";
import { getDevToken, getFirebaseAuth } from "@/lib/cloud/firebase";

export default function CloudHomePage() {
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const ok = Boolean(getFirebaseAuth().currentUser || getDevToken());
      queueMicrotask(() => {
        if (cancelled) return;
        setAuthed(ok);
        if (!ok) return;
        void (async () => {
          try {
            const list = await cloudApi.listOrgs();
            if (!cancelled) {
              setOrgs(list);
              setError(null);
            }
          } catch (err) {
            if (!cancelled) setError((err as Error).message);
          }
        })();
      });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [reloadToken]);

  return (
    <CloudShell title="Organizations">
      {!authed ? null : (
        <>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Cloud notebooks sync live on GCP (Firestore, GCS, Hocuspocus). Create an organization to
            get started.
          </p>
          <div className="mt-6 flex gap-2">
            <input
              className="flex-1 rounded border border-neutral-300 px-3 py-2"
              placeholder="Organization name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
              onClick={() => {
                void cloudApi
                  .createOrg(name.trim() || "My Organization")
                  .then(() => {
                    setName("");
                    setReloadToken((n) => n + 1);
                  })
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Create organization
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <ul className="mt-8 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/cloud/orgs/${org.id}`}
                  className="block px-4 py-3 hover:bg-neutral-50"
                >
                  {org.name}
                </Link>
              </li>
            ))}
            {!orgs.length && (
              <li className="px-4 py-6 text-sm text-neutral-500">No organizations yet.</li>
            )}
          </ul>
        </>
      )}
    </CloudShell>
  );
}
