"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Check, Copy, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import {
  Alert,
  Button,
  ContextMenu,
  Dialog,
  DropdownMenu,
  EmptyState,
  TextField,
  type MenuItem,
} from "@/components/ui";
import { cloudApi, type InviteSummary, type MemberSummary } from "@/lib/cloud/api";
import { orgRoleLabel } from "@/lib/cloud/roles";
import { showNotification } from "@/components/overlays/Notification";

export default function OrgPeoplePage() {
  const { orgId, members, invites, canManage, refresh, setError } = useOrgWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeMember, setRemoveMember] = useState<MemberSummary | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<InviteSummary | null>(null);
  const [createdInvite, setCreatedInvite] = useState<InviteSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const pending = invites.filter((i) => !i.acceptedAt);

  function inviteLink(inv: InviteSummary) {
    if (typeof window === "undefined") return inv.id;
    return `${window.location.origin}/?invite=${inv.id}`;
  }

  async function copyInvite(inv: InviteSummary) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv));
      setCopied(true);
      showNotification("Invite link copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function setMemberRole(uid: string, role: string) {
    void cloudApi
      .patchMember(orgId, uid, { role })
      .then(refresh)
      .catch((err) => setError((err as Error).message));
  }

  /** Recreate invite with same email/role (no dedicated resend API). */
  function resendInvite(inv: InviteSummary) {
    void cloudApi
      .deleteInvite(orgId, inv.id)
      .then(() =>
        cloudApi.createInvite(orgId, {
          email: inv.email,
          role: inv.role === "admin" ? "admin" : "member",
        })
      )
      .then((created) => {
        setCreatedInvite(created);
        refresh();
        showNotification("Invite renewed — share the new link", "success");
      })
      .catch((err) => setError((err as Error).message));
  }

  function memberMenuItems(m: MemberSummary): MenuItem[] {
    if (!canManage || m.role === "owner") {
      return [
        {
          id: "noop",
          label: m.role === "owner" ? "Owner (no actions)" : "View only",
          disabled: true,
          onSelect: () => undefined,
        },
      ];
    }
    return [
      {
        id: "role-member",
        label: "Set role: Member",
        icon: <Users size={14} />,
        disabled: m.role === "member",
        onSelect: () => setMemberRole(m.uid, "member"),
      },
      {
        id: "role-admin",
        label: "Set role: Admin",
        icon: <Shield size={14} />,
        disabled: m.role === "admin",
        onSelect: () => setMemberRole(m.uid, "admin"),
      },
      { id: "sep", label: "", separator: true },
      {
        id: "remove",
        label: "Remove",
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => setRemoveMember(m),
      },
    ];
  }

  function inviteMenuItems(inv: InviteSummary): MenuItem[] {
    if (!canManage) {
      return [
        {
          id: "noop",
          label: "View only",
          disabled: true,
          onSelect: () => undefined,
        },
      ];
    }
    return [
      {
        id: "copy",
        label: "Copy invite link",
        icon: <Copy size={14} />,
        onSelect: () => void copyInvite(inv),
      },
      {
        id: "resend",
        label: "Renew invite",
        icon: <Mail size={14} />,
        onSelect: () => resendInvite(inv),
      },
      { id: "sep", label: "", separator: true },
      {
        id: "revoke",
        label: "Revoke",
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => setRevokeInvite(inv),
      },
    ];
  }

  function openCtx(e: ReactMouseEvent, items: MenuItem[]) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-nb-title font-semibold text-nb-on-surface">People</h2>
          {canManage && (
            <Button size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> Invite
            </Button>
          )}
        </div>

        <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
          {members.map((m) => (
            <li
              key={m.uid}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-nb-body"
              onContextMenu={(e) => openCtx(e, memberMenuItems(m))}
            >
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
                    onChange={(e) => setMemberRole(m.uid, e.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button size="sm" variant="link" onClick={() => setRemoveMember(m)}>
                    Remove
                  </Button>
                  <DropdownMenu items={memberMenuItems(m)} />
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
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
                onContextMenu={(e) => openCtx(e, inviteMenuItems(inv))}
              >
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
                      onClick={() => setRevokeInvite(inv)}
                    >
                      Revoke
                    </Button>
                    <DropdownMenu items={inviteMenuItems(inv)} />
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

      <InvitePeopleDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInviteEmail={(email, role) => {
          setInviteOpen(false);
          void cloudApi
            .createInvite(orgId, { email, role })
            .then((inv) => {
              setCreatedInvite(inv);
              refresh();
            })
            .catch((err) => setError((err as Error).message));
        }}
        onAddByUid={(uid, role) => {
          setInviteOpen(false);
          void cloudApi
            .addMember(orgId, { uid, role })
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

      <ConfirmationDialog
        isOpen={Boolean(revokeInvite)}
        title="Revoke invite?"
        message={`Revoke the invite for ${revokeInvite?.email}? The link will stop working.`}
        confirmLabel="Revoke"
        variant="danger"
        onCancel={() => setRevokeInvite(null)}
        onConfirm={() => {
          const id = revokeInvite?.id;
          setRevokeInvite(null);
          if (!id) return;
          void cloudApi
            .deleteInvite(orgId, id)
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ContextMenu
        open={Boolean(ctx)}
        x={ctx?.x ?? 0}
        y={ctx?.y ?? 0}
        items={ctx?.items ?? []}
        onClose={() => setCtx(null)}
      />
    </div>
  );
}

function InvitePeopleDialog({
  open,
  onClose,
  onInviteEmail,
  onAddByUid,
}: {
  open: boolean;
  onClose: () => void;
  onInviteEmail: (email: string, role: "member" | "admin") => void;
  onAddByUid: (uid: string, role: "member" | "admin") => void;
}) {
  const [mode, setMode] = useState<"email" | "uid">("email");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");

  useEffect(() => {
    if (!open) return;
    setMode("email");
    setEmail("");
    setUid("");
    setRole("member");
  }, [open]);

  const canSubmit =
    mode === "email" ? Boolean(email.trim()) : Boolean(uid.trim());

  function submit() {
    if (mode === "email") {
      const value = email.trim();
      if (!value) return;
      onInviteEmail(value, role);
      return;
    }
    const value = uid.trim();
    if (!value) return;
    onAddByUid(value, role);
  }

  return (
    <Dialog isOpen={open} onClose={onClose} title="Invite people">
      <div className="mb-4 flex gap-1 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low p-1">
        <button
          type="button"
          className={`flex-1 rounded-nb px-2 py-1.5 text-nb-label font-medium transition-colors ${
            mode === "email"
              ? "bg-nb-surface text-nb-on-surface shadow-nb-sm"
              : "text-nb-on-surface-variant hover:text-nb-on-surface"
          }`}
          onClick={() => setMode("email")}
        >
          By email
        </button>
        <button
          type="button"
          className={`flex-1 rounded-nb px-2 py-1.5 text-nb-label font-medium transition-colors ${
            mode === "uid"
              ? "bg-nb-surface text-nb-on-surface shadow-nb-sm"
              : "text-nb-on-surface-variant hover:text-nb-on-surface"
          }`}
          onClick={() => setMode("uid")}
        >
          By account id
        </button>
      </div>

      {mode === "email" ? (
        <TextField
          label="Email"
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="mb-4"
        />
      ) : (
        <TextField
          label="User uid"
          autoFocus
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="mb-4"
        />
      )}

      <label className="mb-6 block">
        <span className="mb-1.5 block text-nb-caption font-medium text-nb-on-surface-variant">
          Role
        </span>
        <select
          className="w-full rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2 text-nb-label outline-none focus:border-nb-primary"
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" disabled={!canSubmit} onClick={submit}>
          {mode === "email" ? "Send invite" : "Add"}
        </Button>
      </div>
    </Dialog>
  );
}
