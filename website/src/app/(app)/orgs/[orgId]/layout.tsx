"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button, EmptyState, LoadingBlock, TabNav } from "@/components/ui";
import {
  OrgWorkspaceProvider,
  useOrgWorkspace,
} from "@/components/cloud/OrgWorkspaceContext";
import { orgRoleLabel } from "@/lib/cloud/roles";

function OrgChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    orgId,
    org,
    notebooks,
    teams,
    members,
    pendingInviteCount,
    error,
    initialLoaded,
    orgUnavailable,
    canManage,
    canDeleteOrg,
    refresh,
    setError,
  } = useOrgWorkspace();

  const activeTab = pathname.includes("/settings")
    ? "settings"
    : pathname.includes("/teams")
      ? "teams"
      : pathname.includes("/people") ||
          pathname.includes("/members") ||
          pathname.includes("/invites")
        ? "people"
        : "notebooks";

  if (!initialLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-sans">
        <LoadingBlock label="Loading organization…" />
      </div>
    );
  }

  if (orgUnavailable) {
    const forbidden = error === "You don’t have access";
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-sans p-6">
        <EmptyState
          className="max-w-md"
          title={forbidden ? "You don’t have access to this organization" : "Organization not found"}
          description={
            forbidden
              ? "Ask an owner to invite you, or open an org from your home list."
              : "This organization may have been deleted, or the link is from another environment."
          }
          action={
            <Button size="sm" variant="primary" onClick={() => router.push("/")}>
              Home
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-nb-display font-bold tracking-tight text-nb-on-surface">
            {org?.name || "Organization"}
          </h1>
          {org?.role && (
            <p className="mt-1 text-nb-label text-nb-on-surface-variant">
              Your role · {orgRoleLabel(org.role)}
            </p>
          )}
        </div>
      </div>

      <TabNav
        activeId={activeTab}
        items={[
          {
            id: "notebooks",
            label: "Notebooks",
            href: `/orgs/${orgId}`,
            count: notebooks.length,
          },
          {
            id: "teams",
            label: "Teams",
            href: `/orgs/${orgId}/teams`,
            count: teams.length,
          },
          {
            id: "people",
            label: "People",
            href: `/orgs/${orgId}/people`,
            count: members.length + pendingInviteCount,
          },
          ...(canManage
            ? [
                {
                  id: "settings",
                  label: "Settings",
                  href: `/orgs/${orgId}/settings`,
                },
              ]
            : []),
        ]}
      />

      {children}
    </div>
  );
}

export default function OrgLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const orgId = String(params.orgId);
  if (/\/notebooks\//.test(pathname || "")) {
    return <>{children}</>;
  }
  return (
    <OrgWorkspaceProvider orgId={orgId}>
      <OrgChrome>{children}</OrgChrome>
    </OrgWorkspaceProvider>
  );
}
