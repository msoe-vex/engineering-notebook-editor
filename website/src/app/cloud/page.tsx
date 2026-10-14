"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi, type OrgSummary } from "@/lib/cloud/api";
import { getDevToken, getFirebaseAuth } from "@/lib/cloud/firebase";

export default function CloudHomePage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [name, setName] = useState("");
  const [inviteId, setInviteId] = useState("");
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
    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [reloadToken]);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

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
                    refresh();
                  })
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Create organization
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Invite id to accept"
              value={inviteId}
              onChange={(e) => setInviteId(e.target.value)}
            />
            <button
              className="rounded border border-neutral-300 px-4 py-2 text-sm"
              onClick={() => {
                const id = inviteId.trim();
                if (!id) return;
                void cloudApi
                  .acceptInvite(id)
                  .then(() => {
                    setInviteId("");
                    refresh();
                  })
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Accept invite
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <ul className="mt-8 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
            {orgs.map((org) => (
              <li key={org.id} className="flex items-center gap-2 px-4 py-3 hover:bg-neutral-50">
                <Link href={`/cloud/orgs/${org.id}`} className="flex-1 font-medium">
                  {org.name}
                </Link>
                <button
                  className="text-xs text-neutral-500 underline"
                  onClick={() => {
                    const next = window.prompt("Rename organization", org.name);
                    if (!next?.trim()) return;
                    void cloudApi
                      .patchOrg(org.id, { name: next.trim() })
                      .then(refresh)
                      .catch((err) => setError((err as Error).message));
                  }}
                >
                  Rename
                </button>
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => {
                    if (!window.confirm(`Delete organization “${org.name}”? This cannot be undone.`)) {
                      return;
                    }
                    void cloudApi
                      .deleteOrg(org.id)
                      .then(refresh)
                      .catch((err) => setError((err as Error).message));
                  }}
                >
                  Delete
                </button>
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
