"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Alert, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { platformRoleLabel } from "@/lib/cloud/roles";

export default function AdminPage() {
  const [users, setUsers] = useState<
    Array<{ uid: string; email?: string; platformRole?: string; grants?: { platformAi?: boolean } }>
  >([]);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const [u, m] = await Promise.all([cloudApi.adminUsers(), cloudApi.adminMetrics()]);
          if (cancelled) return;
          setUsers(u);
          setMetrics(m);
          setError(null);
        } catch (err) {
          if (!cancelled) setError((err as Error).message);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

  return (
    <div className="font-sans">
      <PageHeader
        backHref="/"
        backLabel="Organizations"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-nb-secondary/10 text-nb-secondary">
              <Shield size={20} />
            </span>
            Service Administrator
          </span>
        }
        description="Manage users, grants (Platform AI), and usage metrics."
      />

      {error && <Alert variant="error">{error}</Alert>}

      {metrics && (
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(metrics).map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="text-[10px] font-bold tracking-wider text-nb-on-surface-variant uppercase">
                {k}
              </div>
              <div className="mt-1 text-2xl font-black text-nb-on-surface">{v}</div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-10 text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant uppercase">
        Users
      </h2>
      {users.length > 0 ? (
        <ul className="mt-3 divide-y divide-nb-outline-variant/20 overflow-hidden rounded-2xl border border-nb-outline-variant/30 bg-nb-surface">
          {users.map((u) => (
            <li
              key={u.uid}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-nb-on-surface">{u.email || u.uid}</div>
                <div className="text-[10px] font-bold tracking-wider text-nb-on-surface-variant uppercase">
                  {platformRoleLabel(u.platformRole)} · Platform AI{" "}
                  {u.grants?.platformAi ? "on" : "off"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void cloudApi
                      .patchAdminUser(u.uid, {
                        grants: { platformAi: !u.grants?.platformAi },
                      })
                      .then(refresh);
                  }}
                >
                  Toggle Platform AI
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void cloudApi
                      .patchAdminUser(u.uid, {
                        platformRole: u.platformRole === "service_admin" ? null : "service_admin",
                      })
                      .then(refresh);
                  }}
                >
                  Toggle Service Admin
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-3" title="No users bootstrapped yet." />
      )}
    </div>
  );
}
