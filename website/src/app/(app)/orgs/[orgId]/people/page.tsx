"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Check, Copy, KeyRound, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
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
import { getFirebaseAuth, getDevToken } from "@/lib/cloud/firebase";
import { orgRoleLabel } from "@/lib/cloud/roles";
import { showNotification } from "@/components/overlays/Notification";
import type { OrgRole } from "@engineering-notebook/shared";

export default function OrgPeoplePage() {
  const { orgId, org, members, invites, canManage, refresh, setError } = useOrgWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeMember, setRemoveMember] = useState<MemberSummary | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<InviteSummary | null>(null);
  const [selfDemotionPending, setSelfDemotionPending] = useState<{ uid: string; newRole: string } | null>(null);
  const [createdInvite, setCreatedInvite] = useState<InviteSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const currentUid = getFirebaseAuth().currentUser?.uid || getDevToken()?.split("|")[0];
  const isOwner = org?.role === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const pending = invites.filter((i) => !i.acceptedAt);

  function formatInviteExpiration(expiresAt?: string): {
    label: string;
    isExpiringSoon: boolean;
    isExpired: boolean;
  } {
    if (!expiresAt) return { label: "No expiration", isExpiringSoon: false, isExpired: false };
    const diffMs = Date.parse(expiresAt) - Date.now();
    if (diffMs <= 0) {
      return { label: "Expired", isExpiringSoon: true, isExpired: true };
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays >= 1) {
      return {
        label: `Expires in ${diffDays} ${diffDays === 1 ? "day" : "days"}`,
        isExpiringSoon: diffDays <= 1,
        isExpired: false,
      };
    }
    return {
      label: `Expires in ${diffHours} ${diffHours === 1 ? "hour" : "hours"}`,
      isExpiringSoon: true,
      isExpired: false,
    };
  }

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

  async function copyInviteCode(inv: InviteSummary) {
    try {
      await navigator.clipboard.writeText(inv.id);
      setCopied(true);
      showNotification("Invite code copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function checkAndSetRole(uid: string, targetRole: string) {
    const isSelf = uid === currentUid;
    const currentMember = members.find((m) => m.uid === uid);
    const currentRole = currentMember?.role || "member";
    const roleRank: Record<string, number> = { owner: 3, admin: 2, member: 1 };
    if (isSelf && (roleRank[targetRole] || 0) < (roleRank[currentRole] || 0)) {
      setSelfDemotionPending({ uid, newRole: targetRole });
      return;
    }
    setMemberRole(uid, targetRole);
  }

  function setMemberRole(uid: string, role: string) {
    void cloudApi
      .patchMember(orgId, uid, { role })
      .then(refresh)
      .catch((err) => setError((err as Error).message));
  }

  /** Recreate invite with same email/role. */
  function resendInvite(inv: InviteSummary) {
    void cloudApi
      .deleteInvite(orgId, inv.id)
      .then(() =>
        cloudApi.createInvite(orgId, {
          email: inv.email,
          role: inv.role as OrgRole,
        })
      )
      .then((created) => {
        setCreatedInvite(created);
        refresh();
        showNotification("Invite renewed — share the new link or code", "success");
      })
      .catch((err) => setError((err as Error).message));
  }

  function memberMenuItems(m: MemberSummary): MenuItem[] {
    const isTargetOwner = m.role === "owner";
    const isTargetLastOwner = isTargetOwner && ownerCount <= 1;

    // Non-owners cannot modify or remove owners
    if (!canManage || (!isOwner && isTargetOwner)) {
      return [
        {
          id: "noop",
          label: isTargetOwner ? "Owner (view only)" : "View only",
          disabled: true,
          onSelect: () => undefined,
        },
      ];
    }

    const items: MenuItem[] = [
      {
        id: "role-member",
        label: "Set role: Member",
        icon: <Users size={14} />,
        disabled: m.role === "member" || isTargetLastOwner,
        onSelect: () => checkAndSetRole(m.uid, "member"),
      },
      {
        id: "role-admin",
        label: "Set role: Admin",
        icon: <Shield size={14} />,
        disabled: m.role === "admin" || isTargetLastOwner,
        onSelect: () => checkAndSetRole(m.uid, "admin"),
      },
    ];

    if (isOwner) {
      items.push({
        id: "role-owner",
        label: "Set role: Owner",
        icon: <KeyRound size={14} />,
        disabled: m.role === "owner",
        onSelect: () => checkAndSetRole(m.uid, "owner"),
      });
    }

    items.push({ id: "sep", separator: true });

    items.push({
      id: "remove",
      label: isTargetLastOwner ? "Cannot remove last owner" : "Remove",
      icon: <Trash2 size={14} />,
      danger: !isTargetLastOwner,
      disabled: isTargetLastOwner,
      onSelect: () => !isTargetLastOwner && setRemoveMember(m),
    });

    return items;
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
        id: "copy-link",
        label: "Copy invite link",
        icon: <Copy size={14} />,
        onSelect: () => void copyInvite(inv),
      },
      {
        id: "copy-code",
        label: "Copy share code",
        icon: <KeyRound size={14} />,
        onSelect: () => void copyInviteCode(inv),
      },
      {
        id: "resend",
        label: "Renew invite",
        icon: <Mail size={14} />,
        onSelect: () => resendInvite(inv),
      },
      { id: "sep", separator: true },
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
          <div>
            <h2 className="text-nb-title font-semibold text-nb-on-surface">People</h2>
            <p className="text-nb-caption text-nb-on-surface-variant">
              Manage organization members and assign Owner, Admin, or Member roles.
            </p>
          </div>
          {canManage && (
            <Button size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> Invite
            </Button>
          )}
        </div>

        <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
          {members.map((m) => {
            const isTargetOwner = m.role === "owner";
            const isTargetLastOwner = isTargetOwner && ownerCount <= 1;

            return (
              <li
                key={m.uid}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-nb-body first:rounded-t-nb-xl last:rounded-b-nb-xl"
                onContextMenu={(e) => openCtx(e, memberMenuItems(m))}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-nb-lg bg-nb-surface-low text-nb-on-surface-variant">
                  {isTargetOwner ? <KeyRound size={16} /> : <Users size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-nb-on-surface">
                    {m.displayName ? (
                      <>
                        <span>{m.displayName}</span>
                        {m.email && (
                          <span className="ml-2 font-normal text-nb-on-surface-variant text-nb-caption">
                            ({m.email})
                          </span>
                        )}
                      </>
                    ) : (
                      m.email || m.uid
                    )}
                    {isTargetLastOwner && (
                      <span className="ml-2 text-nb-caption text-nb-on-surface-variant/70">
                        (Primary owner)
                      </span>
                    )}
                  </div>
                  <div className="text-nb-caption text-nb-on-surface-variant">
                    {orgRoleLabel(m.role)}
                  </div>
                </div>

                {canManage && (isOwner || !isTargetOwner) && (
                  <>
                    <select
                      className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-1.5 text-nb-label disabled:opacity-60"
                      value={m.role}
                      disabled={isTargetLastOwner}
                      title={isTargetLastOwner ? "Cannot demote the last owner" : undefined}
                      onChange={(e) => checkAndSetRole(m.uid, e.target.value)}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                    <DropdownMenu items={memberMenuItems(m)} />
                  </>
                )}

                {canManage && !isOwner && isTargetOwner && (
                  <span className="rounded-nb-md bg-nb-surface-low px-2 py-1 text-nb-caption font-medium text-nb-on-surface-variant">
                    Owner
                  </span>
                )}
              </li>
            );
          })}
          {!members.length && (
            <li className="px-4 py-8 text-center text-nb-on-surface-variant">
              No people in this organization yet.
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold text-nb-on-surface">Pending invites & share codes</h2>
        {pending.length > 0 ? (
          <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface text-nb-body">
            {pending.map((inv) => {
              const expiry = formatInviteExpiration(inv.expiresAt);
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 px-4 py-3 first:rounded-t-nb-xl last:rounded-b-nb-xl"
                  onContextMenu={(e) => openCtx(e, inviteMenuItems(inv))}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-nb-on-surface">
                      {inv.email || "Open share code"}
                    </div>
                    <div className="text-nb-caption text-nb-on-surface-variant flex flex-wrap items-center gap-1.5">
                      <span>{orgRoleLabel(inv.role)}</span>
                      <span>·</span>
                      <span>{inv.email ? "Restricted to email" : "Anyone with link/code"}</span>
                      <span>·</span>
                      <span
                        className={
                          expiry.isExpired
                            ? "font-semibold text-nb-danger"
                            : expiry.isExpiringSoon
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : "text-nb-on-surface-variant"
                        }
                        title={inv.expiresAt ? new Date(inv.expiresAt).toLocaleString() : undefined}
                      >
                        {expiry.label}
                      </span>
                    </div>
                  </div>
                  {canManage && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => void copyInvite(inv)}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} Copy link
                      </Button>
                      <DropdownMenu items={inviteMenuItems(inv)} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No pending invites"
            description="Create an invite link or share code to invite teammates."
          />
        )}
      </section>

      {createdInvite && (
        <Alert variant="info" className="flex flex-col gap-2">
          <p>
            Invite created ({orgRoleLabel(createdInvite.role)}). Share this link or code with your teammate:
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-nb-caption font-semibold text-nb-on-surface">Invite link:</span>
            <code className="break-all rounded-nb bg-nb-surface-low px-2 py-1 text-nb-caption">
              {inviteLink(createdInvite)}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-nb-caption font-semibold text-nb-on-surface">Share code:</span>
            <code className="rounded-nb bg-nb-surface-low px-2 py-1 font-mono text-nb-caption font-bold">
              {createdInvite.id}
            </code>
          </div>
          {createdInvite.email && (
            <p className="text-nb-caption text-nb-on-surface-variant">
              Restricted to: <strong>{createdInvite.email}</strong>
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => void copyInvite(createdInvite)}>
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void copyInviteCode(createdInvite)}>
              Copy code
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
        isOwner={isOwner}
        onInvite={(email, role, expiresInDays) => {
          setInviteOpen(false);
          void cloudApi
            .createInvite(orgId, { email, role, expiresInDays })
            .then((inv) => {
              setCreatedInvite(inv);
              refresh();
            })
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
        message={`Revoke invite for ${revokeInvite?.email || "open share code"}? The link and code will no longer work.`}
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

      <ConfirmationDialog
        isOpen={Boolean(selfDemotionPending)}
        title="Demote yourself?"
        message={`Are you sure you want to demote yourself to ${
          selfDemotionPending ? orgRoleLabel(selfDemotionPending.newRole) : ""
        }? You will lose administrative privileges and won't be able to restore them yourself.`}
        confirmLabel="Demote myself"
        variant="danger"
        onCancel={() => setSelfDemotionPending(null)}
        onConfirm={() => {
          if (selfDemotionPending) {
            setMemberRole(selfDemotionPending.uid, selfDemotionPending.newRole);
            setSelfDemotionPending(null);
          }
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
  isOwner,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  isOwner?: boolean;
  onInvite: (email?: string, role?: OrgRole, expiresInDays?: number) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [expiresInDays, setExpiresInDays] = useState(14);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("member");
    setExpiresInDays(14);
  }, [open]);

  function submit() {
    onInvite(email.trim() || undefined, role, expiresInDays);
  }

  return (
    <Dialog isOpen={open} onClose={onClose} title="Create invite link / share code">
      <div className="flex flex-col gap-4">
        <p className="text-nb-body text-nb-on-surface-variant">
          Generate an invite link & share code. Anyone who uses the link or enters the code will join this organization.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-nb-caption font-medium text-nb-on-surface">
            Role to grant
          </span>
          <select
            className="w-full rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface px-3 py-2 text-nb-label outline-none focus:border-nb-primary"
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
          >
            <option value="member">Member — view and edit allowed notebooks</option>
            <option value="admin">Admin — manage members, teams, and notebooks</option>
            {isOwner && <option value="owner">Owner — full organization control</option>}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-nb-caption font-medium text-nb-on-surface">
            Expires after
          </span>
          <select
            className="w-full rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface px-3 py-2 text-nb-label outline-none focus:border-nb-primary"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <TextField
            label="Restrict to email (optional)"
            type="email"
            placeholder="e.g. teammate@example.com (or leave blank for open share link)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <span className="text-nb-caption text-nb-on-surface-variant">
            If left blank, anyone with the link or code can join. If specified, only someone signed in with that email can accept.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-nb-outline-variant/15">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Create invite link
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
