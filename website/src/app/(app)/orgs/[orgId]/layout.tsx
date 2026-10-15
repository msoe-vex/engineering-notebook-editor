"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { Alert, Button, TabNav } from "@/components/ui";
import {
  OrgWorkspaceProvider,
  useOrgWorkspace,
} from "@/components/cloud/OrgWorkspaceContext";
import { cloudApi } from "@/lib/cloud/api";
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
    canManage,
    canDeleteOrg,
    refresh,
    setError,
  } = useOrgWorkspace();

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeTab = pathname.includes("/teams")
    ? "teams"
    : pathname.includes("/people") ||
        pathname.includes("/members") ||
        pathname.includes("/invites")
      ? "people"
      : "notebooks";

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
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
          )}
          {canDeleteOrg && (
            <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete org
            </Button>
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
        ]}
      />

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {children}

      <TextPromptDialog
        isOpen={renameOpen}
        title="Rename organization"
        label="Organization name"
        initialValue={org?.name || ""}
        confirmLabel="Save"
        onCancel={() => setRenameOpen(false)}
        onConfirm={(name) => {
          setRenameOpen(false);
          void cloudApi
            .patchOrg(orgId, { name })
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={deleteOpen}
        title="Delete organization?"
        message="Delete this organization and all notebooks? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          void cloudApi
            .deleteOrg(orgId)
            .then(() => router.push("/"))
            .catch((err) => setError((err as Error).message));
        }}
      />
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
