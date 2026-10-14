"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi } from "@/lib/cloud/api";

export default function OrgNotebooksPage() {
  const params = useParams();
  const orgId = String(params.orgId);
  const [notebooks, setNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<Array<{ uid: string; role: string; email?: string }>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [n, m] = await Promise.all([
        cloudApi.listNotebooks(orgId),
        cloudApi.listMembers(orgId),
      ]);
      setNotebooks(n);
      setMembers(m);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [orgId]);

  return (
    <CloudShell title="Notebooks">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/cloud" className="text-sm text-neutral-500 underline">
            Organizations
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Notebooks</h1>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border border-neutral-300 px-3 py-2"
          placeholder="Notebook name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            void cloudApi
              .createNotebook(orgId, name.trim() || "Competition Notebook")
              .then(() => {
                setName("");
                return refresh();
              })
              .catch((err) => setError((err as Error).message));
          }}
        >
          Create notebook
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <ul className="mt-8 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
        {notebooks.map((nb) => (
          <li key={nb.id}>
            <Link
              href={`/cloud/orgs/${orgId}/notebooks/${nb.id}`}
              className="block px-4 py-3 hover:bg-neutral-50"
            >
              {nb.name}
            </Link>
          </li>
        ))}
        {!notebooks.length && (
          <li className="px-4 py-6 text-sm text-neutral-500">No notebooks yet.</li>
        )}
      </ul>
      <h2 className="mt-10 text-lg font-medium">Members</h2>
      <ul className="mt-3 space-y-1 text-sm text-neutral-700">
        {members.map((m) => (
          <li key={m.uid}>
            {m.email || m.uid} — {m.role}
          </li>
        ))}
      </ul>
    </CloudShell>
  );
}
