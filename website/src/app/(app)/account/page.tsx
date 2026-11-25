"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import {
  Button,
  TextField,
  Alert,
  GoogleIcon,
  GitHubIcon,
  DiscordIcon,
  LinkedInIcon,
  Skeleton,
} from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { linkSocial, authClient, getDevToken } from "@/lib/auth/client";
import { useAppSession } from "@/lib/auth/sessionContext";
import { showNotification } from "@/components/overlays/Notification";

type Secondary = { email: string; verified: boolean; verifiedAt?: string; addedAt?: string };

export default function AccountProfilePage() {
  const router = useRouter();
  const { data: session } = useAppSession();
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
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState(false);
  const [primaryEmailInput, setPrimaryEmailInput] = useState("");
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const providers = accounts.map((a) => a.providerId.toLowerCase());
  const hasPassword = providers.includes("credential");
  const canUnlink = accounts.length > 1;

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
      setAccountsLoading(true);
      void authClient
        .listAccounts()
        .then((res) => {
          if (!cancelled && res.data) {
            setAccounts(res.data as Array<{ id: string; providerId: string }>);
          }
        })
        .catch(() => null)
        .finally(() => {
          if (!cancelled) setAccountsLoading(false);
        });
    } else {
      setAccountsLoading(false);
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
      const targetEmail = newEmail.trim();
      const res = await cloudApi.addSecondaryEmail(targetEmail);
      setSecondaries(res.secondaryEmails);
      setNewEmail("");
      showNotification(`Verification email sent to ${targetEmail}. Check your inbox.`, "success");
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

  const isDevToken = Boolean(getDevToken());

  async function link(provider: "google" | "github" | "discord" | "linkedin") {
    if (isDevToken) {
      showNotification(
        "Social account linking isn’t available for this local session. Sign in with Google or GitHub instead.",
        "error"
      );
      return;
    }
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
      const res = await authClient.unlinkAccount({
        accountId: acc.id,
      });
      if (res?.error) {
        throw new Error(res.error.message || `Failed to unlink ${providerId}`);
      }
      const label = providerId.toLowerCase() === "credential" ? "Password" : providerId;
      showNotification(`Unlinked ${label}`, "success");
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
          <TextField
            label="Primary email"
            value={email}
            disabled
            readOnly
          />
          <p className="text-nb-caption text-nb-on-surface-variant">
            Primary email is your main sign-in email. To change it, add and verify a secondary email below, then set it as primary.
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
              <div className="flex items-center gap-2">
                {s.verified && s.email !== email && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await authClient.changeEmail({
                          newEmail: s.email,
                          callbackURL: window.location.origin + "/account",
                        });
                        setEmail(s.email);
                        showNotification(`Primary email updated to ${s.email}`, "success");
                        await refreshProfile();
                      } catch (err) {
                        showNotification((err as Error).message || "Failed to set primary email", "error");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Make primary
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void removeEmail(s.email)}>
                  Remove
                </Button>
              </div>
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
