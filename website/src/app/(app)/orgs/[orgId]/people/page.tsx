"use client";

import { useState } from "react";
import { Check, Copy, Mail, Plus, UserPlus, Users } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { Alert, Button, EmptyState } from "@/components/ui";
import { cloudApi, type InviteSummary, type MemberSummary } from "@/lib/cloud/api";
import { orgRoleLabel } from "@/lib/cloud/roles";

export default function OrgPeoplePage() {
  const { orgId, members, invites, canManage, refresh, setError } = useOrgWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [addUidOpen, setAddUidOpen] = useState(false);
  const [removeMember, setRemoveMember] = useState<MemberSummary | null>(null);
  const [createdInvite, setCreatedInvite] = useState<InviteSummary | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = invites.filter((i) => !i.acceptedAt);

  function inviteLink(inv: InviteSummary) {
    if (typeof window === "undefined") return inv.id;
    return `${window.location.origin}/?invite=${inv.id}`;
  }

  async function copyInvite(inv: InviteSummary) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-nb-title font-semibold text-nb-on-surface">People</h2>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-2 text-nb-label"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <Button size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
                <Mail size={14} /> Invite by email
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddUidOpen(true)}>
                <UserPlus size={14} /> Advanced
              </Button>
            </div>
          )}
        </div>

        <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
          {members.map((m) => (
            <li key={m.uid} className="flex flex-wrap items-center gap-3 px-4 py-3 text-nb-body">
              <div className="flex h-9 w-9 items-center justify-center rounded-nb-lg bg-nb-surface-low text-nb-on-surface-variant">
                <Users size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">{m.email || m.uid}</div>
                <div className="text-nb-caption text-nb-on-surface-variant">
                  {orgRoleLabel(m.role)}
                </div>
              </div>
              {canManage && m.role !== "owner" && (
                <>
                  <select
                    className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-1.5 text-nb-label"
                    value={m.role}
                    onChange={(e) => {
                      void cloudApi
                        .patchMember(orgId, m.uid, { role: e.target.value })
                        .then(refresh)
                        .catch((err) => setError((err as Error).message));
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button size="sm" variant="link" onClick={() => setRemoveMember(m)}>
                    Remove
                  </Button>
                </>
              )}
            </li>
          ))}
          {!members.length && (
            <li className="px-4 py-8 text-center text-nb-on-surface-variant">
              No people in this organization yet.
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold text-nb-on-surface">Pending invites</h2>
        {pending.length > 0 ? (
          <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface text-nb-body">
            {pending.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-nb-on-surface">{inv.email}</div>
                  <div className="text-nb-caption text-nb-on-surface-variant">
                    {orgRoleLabel(inv.role)} · pending
                  </div>
                </div>
                {canManage && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => void copyInvite(inv)}>
                      {copied ? <Check size={14} /> : <Copy size={14} />} Copy link
                    </Button>
                    <Button
                      size="sm"
                      variant="link"
                      className="text-nb-danger"
                      onClick={() => {
                        void cloudApi
                          .deleteInvite(orgId, inv.id)
                          .then(refresh)
                          .catch((err) => setError((err as Error).message));
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No pending invites" description="Invite teammates by email." />
        )}
      </section>

      {createdInvite && (
        <Alert variant="info" className="flex flex-col gap-2">
          <p>
            Invite created for <strong>{createdInvite.email}</strong>. Share this link:
          </p>
          <code className="break-all rounded-nb bg-nb-surface-low px-2 py-1 text-nb-caption">
            {inviteLink(createdInvite)}
          </code>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copyInvite(createdInvite)}>
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatedInvite(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      <TextPromptDialog
        isOpen={inviteOpen}
        title="Invite to organization"
        label="Email"
        initialValue=""
        confirmLabel="Send invite"
        onCancel={() => setInviteOpen(false)}
        onConfirm={(email) => {
          setInviteOpen(false);
          void cloudApi
            .createInvite(orgId, { email, role: inviteRole })
            .then((inv) => {
              setCreatedInvite(inv);
              refresh();
            })
            .catch((err) => setError((err as Error).message));
        }}
      />

      <TextPromptDialog
        isOpen={addUidOpen}
        title="Add by account id (advanced)"
        label="User uid"
        initialValue=""
        confirmLabel="Add"
        onCancel={() => setAddUidOpen(false)}
        onConfirm={(uid) => {
          setAddUidOpen(false);
          void cloudApi
            .addMember(orgId, { uid, role: "member" })
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(removeMember)}
        title="Remove person?"
        message={`Remove ${removeMember?.email || removeMember?.uid} from this organization?`}
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setRemoveMember(null)}
        onConfirm={() => {
          const uid = removeMember?.uid;
          setRemoveMember(null);
          if (!uid) return;
          void cloudApi
            .removeMember(orgId, uid)
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />
    </div>
  );
}
