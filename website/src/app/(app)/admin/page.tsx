"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Users,
  Building2,
  Activity,
  Server,
  Sparkles,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  TabNav,
  TextField,
} from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import { platformRoleLabel } from "@/lib/cloud/roles";
import { getDevToken } from "@/lib/auth/client";
import { useAppSession } from "@/lib/auth/sessionContext";

type AdminTab = "users" | "orgs" | "metrics";

export default function AdminPage() {
  const { data: session } = useAppSession();
  const currentUid = session?.user?.id || getDevToken()?.split("|")[0];
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<
    Array<{
      uid: string;
      email?: string;
      displayName?: string;
      platformRole?: string;
      grants?: { platformAi?: boolean };
      createdAt?: string;
      updatedAt?: string;
    }>
  >([]);
  const [orgs, setOrgs] = useState<
    Array<{
      id: string;
      name: string;
      slug?: string;
      createdAt?: string;
      createdBy?: string;
      membersCount?: number;
      notebooksCount?: number;
      publicPage?: { visibility?: string };
    }>
  >([]);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "ai">("all");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ uid: string; email?: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    void (async () => {
      try {
        const [u, o, m] = await Promise.all([
          cloudApi.adminUsers().catch(() => []),
          cloudApi.adminOrgs().catch(() => []),
          cloudApi.adminMetrics().catch(() => null),
        ]);
        if (cancelled) return;
        setUsers(u);
        setOrgs(o);
        setMetrics(m);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.uid.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (filterRole === "admin") return u.platformRole === "service_admin";
      if (filterRole === "ai") return Boolean(u.grants?.platformAi);
      return true;
    });
  }, [users, search, filterRole]);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.slug && o.slug.toLowerCase().includes(q)) ||
        o.id.toLowerCase().includes(q)
    );
  }, [orgs, search]);

  const togglePlatformAi = async (uid: string, current: boolean) => {
    setBusyUid(uid);
    try {
      await cloudApi.patchAdminUser(uid, {
        grants: { platformAi: !current },
      });
      showNotification(`Platform AI ${!current ? "granted" : "revoked"}`, "success");
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusyUid(null);
    }
  };

  const toggleServiceAdmin = async (uid: string, currentRole?: string) => {
    setBusyUid(uid);
    const nextRole = currentRole === "service_admin" ? null : "service_admin";
    try {
      await cloudApi.patchAdminUser(uid, {
        platformRole: nextRole,
      });
      showNotification(
        nextRole ? "Granted Service Admin role" : "Removed Service Admin role",
        "success"
      );
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusyUid(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const { uid } = userToDelete;
    setUserToDelete(null);
    setBusyUid(uid);
    try {
      // 1. Delete user from Core platform store (organizations, profile)
      await cloudApi.deleteAdminUser(uid);

      // 2. Cascade delete from Better Auth (users, accounts, sessions)
      try {
        await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
          method: "DELETE",
        });
      } catch (authErr) {
        console.warn("Failed to cascade delete Better Auth user records:", authErr);
      }

      showNotification("User removed from platform", "success");
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl font-sans pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          backHref="/"
          backLabel="Home"
          title={
            <span className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-nb-primary/10 text-nb-primary shadow-xs ring-1 ring-nb-primary/20">
                <Shield size={20} />
              </span>
              Platform Administration
            </span>
          }
          description="Global management for users, organization workspaces, cluster services, and operational health."
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={refresh}
            disabled={refreshing}
            className="h-9 gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-nb-primary" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/* Top Level Metric Summary Cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <Card className="flex items-center gap-3.5 p-4 border border-nb-outline-variant/30 bg-nb-surface shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
              Registered Users
            </p>
            <p className="text-2xl font-black text-nb-on-surface">{users.length}</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4 border border-nb-outline-variant/30 bg-nb-surface shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Building2 size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
              Organizations
            </p>
            <p className="text-2xl font-black text-nb-on-surface">{orgs.length}</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4 border border-nb-outline-variant/30 bg-nb-surface shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Activity size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
              Total Requests
            </p>
            <p className="text-2xl font-black text-nb-on-surface">
              {metrics?.totalRequests ?? "0"}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4 border border-nb-outline-variant/30 bg-nb-surface shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Server size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
              Core Service
            </p>
            <p className="text-lg font-bold text-nb-on-surface flex items-center gap-1.5 mt-0.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Connected
            </p>
          </div>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <div className="mt-8">
        <TabNav
          activeId={tab}
          onSelect={(id) => {
            setTab(id as AdminTab);
            setSearch("");
          }}
          items={[
            { id: "users", label: "Users", count: users.length },
            { id: "orgs", label: "Organizations", count: orgs.length },
            { id: "metrics", label: "Traffic & Latency" },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Spinner size={32} />
        </div>
      ) : (
        <div className="mt-6">
          {/* TAB 1: USERS */}
          {tab === "users" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by email, name, or UID…"
                    className="h-10 w-full rounded-xl border border-nb-outline-variant/30 bg-nb-surface pl-9 pr-4 text-sm text-nb-on-surface placeholder:text-nb-on-surface-variant/60 focus:border-nb-primary focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-nb-on-surface-variant flex items-center gap-1">
                    <SlidersHorizontal size={13} /> Filter:
                  </span>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value as any)}
                    className="h-9 rounded-lg border border-nb-outline-variant/30 bg-nb-surface px-2.5 text-xs font-medium text-nb-on-surface focus:border-nb-primary focus:outline-none"
                  >
                    <option value="all">All Users</option>
                    <option value="admin">Service Admins</option>
                    <option value="ai">Platform AI Granted</option>
                  </select>
                </div>
              </div>

              {filteredUsers.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-nb-outline-variant/30 bg-nb-surface shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-nb-outline-variant/20 bg-nb-surface-low text-[11px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
                        <tr>
                          <th className="px-5 py-3">User</th>
                          <th className="px-4 py-3">Primary Email</th>
                          <th className="px-4 py-3">Platform Role</th>
                          <th className="px-4 py-3">Capabilities</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-nb-outline-variant/20">
                        {filteredUsers.map((u) => {
                          const isAdmin = u.platformRole === "service_admin";
                          const hasAi = Boolean(u.grants?.platformAi);
                          const isBusy = busyUid === u.uid;

                          return (
                            <tr key={u.uid} className="hover:bg-nb-surface-low/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="font-semibold text-nb-on-surface">
                                  {u.displayName || "Unnamed User"}
                                </div>
                                <div className="font-mono text-xs text-nb-on-surface-variant/70">
                                  {u.uid}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                {u.email ? (
                                  <span className="font-medium text-nb-on-surface">{u.email}</span>
                                ) : (
                                  <span className="text-nb-on-surface-variant/50 italic text-xs">No email</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <Badge
                                  tone={isAdmin ? "primary" : "neutral"}
                                  className="font-medium"
                                >
                                  {platformRoleLabel(u.platformRole)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    tone={hasAi ? "tertiary" : "neutral"}
                                    className="gap-1 font-medium"
                                  >
                                    <Sparkles size={11} />
                                    {hasAi ? "Platform AI" : "Standard"}
                                  </Badge>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant={hasAi ? "ghost" : "secondary"}
                                    disabled={isBusy}
                                    onClick={() => void togglePlatformAi(u.uid, hasAi)}
                                    className="h-8 text-xs font-semibold"
                                  >
                                    {hasAi ? "Revoke AI" : "Grant AI"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={isAdmin ? "secondary" : "ghost"}
                                    disabled={isBusy || (isAdmin && u.uid === currentUid)}
                                    title={isAdmin && u.uid === currentUid ? "You cannot demote yourself" : undefined}
                                    onClick={() => void toggleServiceAdmin(u.uid, u.platformRole)}
                                    className="h-8 text-xs font-semibold"
                                  >
                                    {isAdmin ? "Demote" : "Promote Admin"}
                                  </Button>
                                  {u.uid !== currentUid && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={isBusy}
                                      onClick={() => setUserToDelete({ uid: u.uid, email: u.email })}
                                      className="h-8 w-8 p-0 text-nb-danger hover:bg-nb-danger/10"
                                      title="Delete user"
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No users found"
                  description={
                    search ? `No users matching “${search}”` : "No users bootstrapped in Firestore."
                  }
                />
              )}
            </div>
          )}

          {/* TAB 2: ORGANIZATIONS */}
          {tab === "orgs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by organization name or slug…"
                    className="h-10 w-full rounded-xl border border-nb-outline-variant/30 bg-nb-surface pl-9 pr-4 text-sm text-nb-on-surface placeholder:text-nb-on-surface-variant/60 focus:border-nb-primary focus:outline-none"
                  />
                </div>
              </div>

              {filteredOrgs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredOrgs.map((org) => {
                    const isPublished = org.publicPage?.visibility === "public";
                    return (
                      <Card
                        key={org.id}
                        className="flex flex-col justify-between p-4 border border-nb-outline-variant/30 bg-nb-surface hover:border-nb-outline-variant/60 transition-colors"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-base text-nb-on-surface">{org.name}</h3>
                            <Badge tone={isPublished ? "tertiary" : "neutral"}>
                              {isPublished ? "Public Site" : "Private Workspace"}
                            </Badge>
                          </div>
                          <p className="mt-1 font-mono text-xs text-nb-on-surface-variant">
                            slug: {org.slug || "—"}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-nb-on-surface-variant/70 truncate">
                            id: {org.id}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-nb-outline-variant/20 flex items-center justify-between">
                          <span className="text-xs text-nb-on-surface-variant">
                            Created:{" "}
                            {org.createdAt
                              ? new Date(org.createdAt).toLocaleDateString()
                              : "—"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {org.slug && isPublished && (
                              <Link
                                href={`/o/${org.slug}`}
                                target="_blank"
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-nb-outline-variant/30 px-2.5 text-xs font-semibold text-nb-primary hover:bg-nb-surface-low"
                              >
                                View Site <ExternalLink size={12} />
                              </Link>
                            )}
                            <Link
                              href={`/org/${org.id}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg bg-nb-surface-low px-2.5 text-xs font-semibold text-nb-on-surface hover:bg-nb-surface-container"
                            >
                              Manage <ArrowUpRight size={12} />
                            </Link>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No organizations found"
                  description={
                    search
                      ? `No organizations matching “${search}”`
                      : "No organizations registered yet."
                  }
                />
              )}
            </div>
          )}

          {/* TAB 3: METRICS & TRAFFIC */}
          {tab === "metrics" && (
            <div className="space-y-4">
              {metrics ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      HTTP 2xx (Success)
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {metrics.status2xx ?? 0}
                    </p>
                  </Card>
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      HTTP 4xx (Client Error)
                    </p>
                    <p className="mt-1 text-2xl font-black text-amber-500">
                      {metrics.status4xx ?? 0}
                    </p>
                  </Card>
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      HTTP 5xx (Server Error)
                    </p>
                    <p className="mt-1 text-2xl font-black text-red-500">
                      {metrics.status5xx ?? 0}
                    </p>
                  </Card>
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      Average Latency
                    </p>
                    <p className="mt-1 text-2xl font-black text-nb-on-surface">
                      {metrics.averageLatencyMs ?? 0} ms
                    </p>
                  </Card>
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      Active Realtime Sockets
                    </p>
                    <p className="mt-1 text-2xl font-black text-nb-primary">
                      {metrics.activeCollaborationConnections ?? 0}
                    </p>
                  </Card>
                  <Card className="p-4 border border-nb-outline-variant/30 bg-nb-surface">
                    <p className="text-xs font-bold uppercase tracking-wider text-nb-on-surface-variant">
                      Total Latency Accumulated
                    </p>
                    <p className="mt-1 text-2xl font-black text-nb-on-surface">
                      {metrics.totalLatencyMs ? `${Math.round(metrics.totalLatencyMs / 1000)}s` : "0s"}
                    </p>
                  </Card>
                </div>
              ) : (
                <EmptyState title="No metrics available" description="Metrics store has not recorded requests yet." />
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmationDialog
        isOpen={Boolean(userToDelete)}
        title="Delete User"
        message={`Are you sure you want to delete user ${userToDelete?.email || userToDelete?.uid}? This cannot be undone.`}
        confirmLabel="Delete User"
        variant="danger"
        onConfirm={() => void confirmDeleteUser()}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
