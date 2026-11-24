"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { Button, TextField, Alert, GoogleIcon, GitHubIcon, DiscordIcon, LinkedInIcon } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { useSession, linkSocial, authClient } from "@/lib/auth/client";
import { showNotification } from "@/components/overlays/Notification";

type Secondary = { email: string; verified: boolean; verifiedAt?: string; addedAt?: string };

export default function AccountProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [secondaries, setSecondaries] = useState<Secondary[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; providerId: string }>>([]);
  const [editingEmail, setEditingEmail] = useState(false);
  const [primaryEmailInput, setPrimaryEmailInput] = useState("");
  const [leaveHref, setLeaveHref] = useState<string | null>(null);

  const providers = accounts.map((a) => a.providerId.toLowerCase());

  function refreshProfile() {
    return cloudApi
      .me()
      .then((u) => {
        const row = u as {
          displayName?: string;
          email?: string;
          secondaryEmails?: Secondary[];
        };
        const name = row.displayName || session?.user?.name || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(row.email || session?.user?.email || "");
        setSecondaries(row.secondaryEmails || []);
      })
      .catch(() => {
        const name = session?.user?.name || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(session?.user?.email || "");
      });
  }

  useEffect(() => {
    let cancelled = false;
    void refreshProfile();

    if (session?.user) {
      void authClient.listAccounts().then((res) => {
        if (!cancelled && res.data) {
          setAccounts(res.data as Array<{ id: string; providerId: string }>);
        }
      }).catch(() => null);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    const token = searchParams.get("verifyEmail");
    if (!token) return;
    void cloudApi
      .verifySecondaryEmail(token)
      .then(() => {
        showNotification("Secondary email verified", "success");
        return refreshProfile();
      })
      .catch((err) => showNotification((err as Error).message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isDirty = displayName.trim() !== initialDisplayName.trim();

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleClickCapture = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || target.target === "_blank") return;

      if (href !== window.location.pathname) {
        e.preventDefault();
        e.stopPropagation();
        setLeaveHref(href);
      }
    };
    document.addEventListener("click", handleClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [isDirty]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const name = displayName.trim() || undefined;
      await cloudApi.patchMe({ displayName: name });
      setInitialDisplayName(name || "");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ene:profile-updated", { detail: { displayName: name } })
        );
      }
      setMessage("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addEmail() {
    if (!newEmail.trim()) return;
    setSaving(true);
    try {
      const res = await cloudApi.addSecondaryEmail(newEmail.trim());
      setSecondaries(res.secondaryEmails);
      setNewEmail("");
      showNotification("Verification email sent (check console/Mailhog locally)", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEmail(addr: string) {
    setSaving(true);
    try {
      const res = await cloudApi.removeSecondaryEmail(addr);
      setSecondaries(res.secondaryEmails);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function link(provider: "google" | "github" | "discord" | "linkedin") {
    try {
      await linkSocial({
        provider,
        callbackURL: window.location.origin + "/account",
      });
      showNotification(`Redirecting to link ${provider}…`, "info");
    } catch (err) {
      showNotification((err as Error).message, "error");
    }
  }

  async function unlink(providerId: string) {
    const acc = accounts.find((a) => a.providerId.toLowerCase() === providerId.toLowerCase() || a.providerId.toLowerCase() === `${providerId.toLowerCase()}.com`);
    if (!acc) return;
    try {
      await authClient.unlinkAccount({
        accountId: acc.id,
      });
      showNotification(`Unlinked ${providerId}`, "success");
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    } catch (err) {
      showNotification((err as Error).message, "error");
    }
  }

  async function updatePrimaryEmail() {
    if (!primaryEmailInput.trim() || primaryEmailInput.trim() === email) {
      setEditingEmail(false);
      return;
    }
    setSaving(true);
    try {
      await authClient.changeEmail({
        newEmail: primaryEmailInput.trim(),
        callbackURL: window.location.origin + "/account",
      });
      setEmail(primaryEmailInput.trim());
      setEditingEmail(false);
      showNotification("Primary email updated.", "success");
    } catch (err) {
      showNotification((err as Error).message || "Failed to update email", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-nb-title font-semibold text-nb-on-surface">Profile</h2>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Manage your display name across organizations and notebooks.
          </p>
        </div>
        {isDirty && (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>

      {session?.user && !session.user.emailVerified && (
        <Alert variant="warning" className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-xs">Email not verified</p>
            <p className="text-xs text-nb-on-surface-variant">
              Please verify your email address to ensure full account recovery and access.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              showNotification("Verification email dispatched", "success");
            }}
          >
            Send verification
          </Button>
        </Alert>
      )}

      <section className="space-y-3">
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
        <div className="space-y-1">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label="Primary email"
                value={editingEmail ? primaryEmailInput : email}
                disabled={!editingEmail}
                readOnly={!editingEmail}
                onChange={(e) => setPrimaryEmailInput(e.target.value)}
              />
            </div>
            {editingEmail ? (
              <div className="flex items-center gap-1.5 pb-0.5">
                <Button size="sm" variant="primary" disabled={saving} onClick={() => void updatePrimaryEmail()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditingEmail(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="pb-0.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPrimaryEmailInput(email);
                    setEditingEmail(true);
                  }}
                >
                  Change email
                </Button>
              </div>
            )}
          </div>
          <p className="text-nb-caption text-nb-on-surface-variant">
            Primary email is your main sign-in email. Verified secondary emails can match org invites.
          </p>
        </div>
      </section>
      {error && <p className="text-nb-caption text-nb-danger">{error}</p>}
      {message && <p className="text-nb-caption text-nb-primary">{message}</p>}
      <Button variant="primary" disabled={saving || !isDirty} onClick={() => void save()}>
        {saving ? "Saving…" : "Save profile"}
      </Button>

      <section className="space-y-3 border-t border-nb-outline-variant/20 pt-6">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Secondary emails</h3>
        <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30">
          {secondaries.map((s) => (
            <li key={s.email} className="flex items-center justify-between gap-3 px-4 py-3 text-nb-body">
              <div>
                <span className="font-medium">{s.email}</span>
                <span className="ml-2 text-nb-caption text-nb-on-surface-variant">
                  {s.verified ? "Verified" : "Pending verification"}
                </span>
              </div>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void removeEmail(s.email)}>
                Remove
              </Button>
            </li>
          ))}
          {!secondaries.length && (
            <li className="px-4 py-6 text-center text-nb-caption text-nb-on-surface-variant">
              No secondary emails yet.
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <TextField
            label="Add email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@school.edu"
          />
          <Button size="sm" variant="secondary" disabled={saving || !newEmail.trim()} onClick={() => void addEmail()}>
            Add & send verify
          </Button>
        </div>
      </section>

      <section className="space-y-3 border-t border-nb-outline-variant/20 pt-6">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Linked providers</h3>
        <ul className="space-y-2 text-nb-caption text-nb-on-surface-variant">
          {providers.length ? (
            providers.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-nb-on-surface capitalize">{id.replace(".com", "")}</span>
                <Button size="sm" variant="ghost" className="text-nb-danger hover:bg-nb-danger/10" onClick={() => void unlink(id)}>
                  Unlink
                </Button>
              </li>
            ))
          ) : (
            <li>password / email only</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          {!providers.includes("google") && !providers.includes("google.com") && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => void link("google")}>
              <GoogleIcon className="h-4 w-4" />
              Link Google
            </Button>
          )}
          {!providers.includes("github") && !providers.includes("github.com") && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => void link("github")}>
              <GitHubIcon className="h-4 w-4" />
              Link GitHub
            </Button>
          )}
          {!providers.includes("discord") && !providers.includes("discord.com") && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => void link("discord")}>
              <DiscordIcon className="h-4 w-4 text-[#5865F2]" />
              Link Discord
            </Button>
          )}
          {!providers.includes("linkedin") && !providers.includes("linkedin.com") && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => void link("linkedin")}>
              <LinkedInIcon className="h-4 w-4 text-[#0A66C2]" />
              Link LinkedIn
            </Button>
          )}
        </div>
      </section>

      <ConfirmationDialog
        isOpen={Boolean(leaveHref)}
        title="Leave without saving?"
        message="You have unsaved changes. Leave this page anyway?"
        variant="warning"
        confirmLabel="Leave"
        onConfirm={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onCancel={() => setLeaveHref(null)}
      />
    </div>
  );
}
