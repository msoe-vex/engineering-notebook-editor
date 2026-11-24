"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  Calendar,
  Handshake,
  Rocket,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
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
    error,
    initialLoaded,
    orgUnavailable,
    canManage,
    canDeleteOrg,
    refresh,
    setError,
  } = useOrgWorkspace();

  const activeTab = pathname.includes("/settings") || pathname.includes("/public")
    ? "settings"
    : pathname.includes("/donors")
      ? "donors"
      : pathname.includes("/projects")
        ? "projects"
        : pathname.includes("/events")
          ? "events"
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
            href: `/org/${orgId}`,
            icon: <BookOpen size={14} />,
          },
          {
            id: "teams",
            label: "Teams",
            href: `/org/${orgId}/teams`,
            icon: <UsersRound size={14} />,
          },
          {
            id: "people",
            label: "People",
            href: `/org/${orgId}/people`,
            icon: <Users size={14} />,
          },
          ...(canManage
            ? [
                {
                  id: "donors",
                  label: "Donors",
                  href: `/org/${orgId}/donors`,
                  icon: <Handshake size={14} />,
                },
                {
                  id: "projects",
                  label: "Projects",
                  href: `/org/${orgId}/projects`,
                  icon: <Rocket size={14} />,
                },
                {
                  id: "events",
                  label: "Events",
                  href: `/org/${orgId}/events`,
                  icon: <Calendar size={14} />,
                },
                {
                  id: "settings",
                  label: "Settings",
                  href: `/org/${orgId}/settings`,
                  icon: <Settings size={14} />,
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
  if (/\/notebook\//.test(pathname || "") || /\/notebooks\//.test(pathname || "")) {
    return <>{children}</>;
  }
  return (
    <OrgWorkspaceProvider orgId={orgId}>
      <OrgChrome>{children}</OrgChrome>
    </OrgWorkspaceProvider>
  );
}
