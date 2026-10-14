"use client";

import { useEffect, useState } from "react";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi } from "@/lib/cloud/api";

export default function AdminPage() {
  const [users, setUsers] = useState<
    Array<{ uid: string; email?: string; platformRole?: string; grants?: { platformAi?: boolean } }>
  >([]);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [u, m] = await Promise.all([cloudApi.adminUsers(), cloudApi.adminMetrics()]);
      setUsers(u);
      setMetrics(m);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <CloudShell title="Service Administrator">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Manage users, grants (platform AI), and usage metrics.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {metrics && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(metrics).map(([k, v]) => (
            <div key={k} className="rounded border border-neutral-200 bg-white p-3 text-sm">
              <div className="text-neutral-500">{k}</div>
              <div className="text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}
      <h2 className="mt-10 text-lg font-medium">Users</h2>
      <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
        {users.map((u) => (
          <li key={u.uid} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{u.email || u.uid}</div>
              <div className="text-neutral-500">
                {u.platformRole || "user"} · platformAi={String(Boolean(u.grants?.platformAi))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded border px-2 py-1"
                onClick={() => {
                  void cloudApi
                    .patchAdminUser(u.uid, {
                      grants: { platformAi: !u.grants?.platformAi },
                    })
                    .then(refresh);
                }}
              >
                Toggle platform AI
              </button>
              <button
                className="rounded border px-2 py-1"
                onClick={() => {
                  void cloudApi
                    .patchAdminUser(u.uid, {
                      platformRole: u.platformRole === "service_admin" ? null : "service_admin",
                    })
                    .then(refresh);
                }}
              >
                Toggle service admin
              </button>
            </div>
          </li>
        ))}
        {!users.length && (
          <li className="px-4 py-6 text-neutral-500">No users bootstrapped yet.</li>
        )}
      </ul>
    </CloudShell>
  );
}
