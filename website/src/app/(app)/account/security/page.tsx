"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, ShieldCheck, Fingerprint, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  Alert,
  Button,
  Dialog,
  DiscordIcon,
  GitHubIcon,
  GoogleIcon,
  LinkedInIcon,
  Skeleton,
  TextField,
} from "@/components/ui";
import { authClient, getDevToken, linkSocial, useSession } from "@/lib/auth/client";
import { showNotification } from "@/components/overlays/Notification";

type LinkedAccount = { id: string; providerId: string };
type PasskeyRecord = { id: string; name?: string | null; createdAt?: string | Date | null };

export default function AccountSecurityPage() {
  const { data: session, refetch: refetchSession } = useSession();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  // Password modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Two-Factor (MFA) modal
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<"totp" | "otp">("totp");
  const [mfaPassword, setMfaPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  // Passkey modal (optional rename after registration)
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const isDevToken = Boolean(getDevToken());
  const providers = accounts.map((a) => a.providerId.toLowerCase());
  const hasPassword = providers.includes("credential");
  const canUnlink = accounts.length > 1;
  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled
  );

  useEffect(() => {
    let cancelled = false;
    if (!session?.user) {
      setAccountsLoading(false);
      return;
    }
    setAccountsLoading(true);
    void Promise.all([
      authClient.listAccounts().then((res) => {
        if (!cancelled && res.data) {
          setAccounts(res.data as LinkedAccount[]);
        }
      }),
      authClient.passkey
        .listUserPasskeys()
        .then((res) => {
          if (!cancelled && res.data) {
            setPasskeys(res.data as PasskeyRecord[]);
          }
        })
        .catch(() => null),
    ]).finally(() => {
      if (!cancelled) setAccountsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

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
        callbackURL: window.location.origin + "/account/security",
      });
      showNotification(`Redirecting to link ${provider}…`, "info");
    } catch (err) {
      showNotification((err as Error).message, "error");
    }
  }

  async function unlink(providerId: string) {
    const acc = accounts.find(
      (a) =>
        a.providerId.toLowerCase() === providerId.toLowerCase() ||
        a.providerId.toLowerCase() === `${providerId.toLowerCase()}.com`
    );
    if (!acc) return;
    try {
      const res = await authClient.unlinkAccount({ accountId: acc.id });
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

  function closePasswordModal() {
    setPasswordModalOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function closeMfaModal() {
    setMfaModalOpen(false);
    setMfaPassword("");
    setTotpUri(null);
    setBackupCodes(null);
    setMfaCode("");
    setOtpSent(false);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      showNotification("Passwords do not match.", "error");
      return;
    }
    setChangingPassword(true);
    try {
      if (hasPassword) {
        const res = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (res?.error) throw new Error(res.error.message || "Failed to change password.");
        showNotification("Password updated.", "success");
      } else {
        const res = await fetch("/api/auth/set-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newPassword }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to set password.");
        const accRes = await authClient.listAccounts().catch(() => null);
        if (accRes?.data) setAccounts(accRes.data as LinkedAccount[]);
        showNotification("Password set. You can now sign in with email and password.", "success");
      }
      closePasswordModal();
    } catch (err) {
      showNotification((err as Error).message || "Failed to update password.", "error");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleStartMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaPassword) return;
    setMfaBusy(true);
    try {
      const res = await authClient.twoFactor.enable({ password: mfaPassword });
      if (res.error) throw new Error(res.error.message || "Failed to start 2FA setup");
      if (res.data && "totpURI" in res.data) {
        setTotpUri(res.data.totpURI ?? null);
        setBackupCodes(res.data.backupCodes ?? null);
      }
      setMfaPassword("");
      if (mfaMethod === "otp") {
        const otpRes = await authClient.twoFactor.sendOtp();
        if (otpRes.error) throw new Error(otpRes.error.message || "Failed to send 6-digit code");
        setOtpSent(true);
        showNotification("6-digit verification code sent to your email.", "success");
      }
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaCode.trim()) return;
    setMfaBusy(true);
    try {
      const res =
        mfaMethod === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: mfaCode.trim() })
          : await authClient.twoFactor.verifyOtp({ code: mfaCode.trim() });
      if (res.error) throw new Error(res.error.message || "Invalid verification code");
      await refetchSession();
      closeMfaModal();
      showNotification("Two-factor authentication enabled.", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleDisableMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaPassword) return;
    setMfaBusy(true);
    try {
      const res = await authClient.twoFactor.disable({ password: mfaPassword });
      if (res.error) throw new Error(res.error.message || "Failed to disable 2FA");
      await refetchSession();
      closeMfaModal();
      showNotification("Two-factor authentication disabled.", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleAddPasskey() {
    setPasskeyBusy(true);
    try {
      const res = await authClient.passkey.addPasskey();
      if (res?.error) throw new Error(res.error.message || "Failed to register passkey");
      const list = await authClient.passkey.listUserPasskeys();
      if (list.data) {
        const updated = list.data as PasskeyRecord[];
        setPasskeys(updated);
        const created =
          (res?.data as PasskeyRecord | undefined) || updated[updated.length - 1];
        if (created?.id) {
          setEditingPasskeyId(created.id);
          setPasskeyName(created.name || "");
          setPasskeyModalOpen(true);
        }
      }
      showNotification("Passkey registered.", "success");
    } catch (err) {
      showNotification((err as Error).message || "Failed to register passkey", "error");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function handleRenamePasskey(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPasskeyId || !passkeyName.trim()) {
      setPasskeyModalOpen(false);
      return;
    }
    setPasskeyBusy(true);
    try {
      const res = await authClient.passkey.updatePasskey({
        id: editingPasskeyId,
        name: passkeyName.trim(),
      });
      if (res?.error) throw new Error(res.error.message || "Failed to rename passkey");
      setPasskeys((prev) =>
        prev.map((p) => (p.id === editingPasskeyId ? { ...p, name: passkeyName.trim() } : p))
      );
      setPasskeyModalOpen(false);
      setEditingPasskeyId(null);
      setPasskeyName("");
      showNotification("Passkey name updated.", "success");
    } catch (err) {
      showNotification((err as Error).message || "Failed to rename passkey", "error");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setPasskeyBusy(true);
    try {
      const res = await authClient.passkey.deletePasskey({ id });
      if (res?.error) throw new Error(res.error.message || "Failed to remove passkey");
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      showNotification("Passkey removed.", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <h2 className="text-nb-title font-semibold text-nb-on-surface">Sign in &amp; Security</h2>
        <p className="mt-1 text-nb-body text-nb-on-surface-variant">
          Manage your linked providers, password, two-factor authentication, and passkeys.
        </p>
      </div>

      {/* Linked providers */}
      <section className="space-y-3 border-t border-nb-outline-variant/20 pt-6">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Linked providers</h3>
        {isDevToken && (
          <Alert variant="info">
            Local development session — link Google, GitHub, Discord, or LinkedIn after signing in with those providers.
          </Alert>
        )}
        {accountsLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading linked providers">
            <Skeleton className="h-10 w-full rounded-nb-lg" />
            <Skeleton className="h-10 w-full rounded-nb-lg" />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30">
              {providers.length ? (
                providers.map((id) => {
                  const key = id.replace(/\.com$/i, "").toLowerCase();
                  const Icon =
                    key === "google"
                      ? GoogleIcon
                      : key === "github"
                        ? GitHubIcon
                        : key === "discord"
                          ? DiscordIcon
                          : key === "linkedin"
                            ? LinkedInIcon
                            : key === "credential"
                              ? KeyRound
                              : null;
                  const label = key === "credential" ? "Password" : key;
                  return (
                    <li
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-nb-body"
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-nb-on-surface capitalize">
                        {Icon ? <Icon className="h-4 w-4" /> : null}
                        {label}
                        <span className="text-nb-caption font-normal text-nb-on-surface-variant">
                          Connected
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canUnlink}
                        title={
                          canUnlink
                            ? `Unlink ${label}`
                            : "Cannot unlink your only sign-in method. Link another provider or set a password first."
                        }
                        className="text-nb-danger hover:bg-nb-danger/10 disabled:opacity-40"
                        onClick={() => void unlink(id)}
                      >
                        Unlink
                      </Button>
                    </li>
                  );
                })
              ) : (
                <li className="px-4 py-6 text-center text-nb-caption text-nb-on-surface-variant">
                  No linked providers
                </li>
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
          </>
        )}
      </section>

      {/* Password */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-nb-outline-variant/20 pt-6">
        <div>
          <h3 className="text-nb-body font-semibold text-nb-on-surface">Password</h3>
          <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
            {hasPassword
              ? "A password is set on your account for email sign-in."
              : "Set a password if you also want to sign in with your email."}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setPasswordModalOpen(true)}>
          {hasPassword ? "Change password" : "Set password"}
        </Button>
      </section>

      {/* Two-Factor Authentication (MFA) */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-nb-outline-variant/20 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-nb-primary" />
            <h3 className="text-nb-body font-semibold text-nb-on-surface">
              Two-factor authentication (MFA)
            </h3>
          </div>
          <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
            {twoFactorEnabled
              ? "Enabled — your account is protected with a second verification step."
              : "Add an extra layer of security with an authenticator app or 6-digit email code."}
          </p>
        </div>
        <Button
          size="sm"
          variant={twoFactorEnabled ? "danger" : "secondary"}
          disabled={!hasPassword}
          title={!hasPassword ? "Set a password first to enable 2FA." : undefined}
          onClick={() => setMfaModalOpen(true)}
        >
          {twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
        </Button>
      </section>

      {/* Passkeys */}
      <section className="space-y-3 border-t border-nb-outline-variant/20 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Fingerprint size={18} className="text-nb-primary" />
              <h3 className="text-nb-body font-semibold text-nb-on-surface">Passkeys</h3>
            </div>
            <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
              Use Face ID, Touch ID, Windows Hello, or a hardware security key to sign in.
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={passkeyBusy} onClick={() => void handleAddPasskey()}>
            {passkeyBusy ? "Registering…" : "Add passkey"}
          </Button>
        </div>
        <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30">
          {passkeys.length ? (
            passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between gap-2 px-4 py-3 text-nb-body">
                <span className="inline-flex items-center gap-2 font-medium text-nb-on-surface">
                  <Fingerprint size={16} className="text-nb-on-surface-variant" />
                  {pk.name || "Passkey"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={passkeyBusy}
                  className="text-nb-danger hover:bg-nb-danger/10"
                  onClick={() => void handleDeletePasskey(pk.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-center text-nb-caption text-nb-on-surface-variant">
              No passkeys registered yet.
            </li>
          )}
        </ul>
      </section>

      {/* Password Modal */}
      <Dialog
        isOpen={passwordModalOpen}
        onClose={closePasswordModal}
        title={hasPassword ? "Change password" : "Set password"}
      >
        <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-4">
          {hasPassword && (
            <TextField
              label="Current password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
          <TextField
            label="New password"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="ghost" onClick={closePasswordModal}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={changingPassword}>
              {changingPassword ? "Saving…" : hasPassword ? "Update password" : "Set password"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 2FA / MFA Modal */}
      <Dialog
        isOpen={mfaModalOpen}
        onClose={closeMfaModal}
        title={twoFactorEnabled ? "Disable two-factor authentication" : "Enable two-factor authentication"}
      >
        {twoFactorEnabled ? (
          <form onSubmit={(e) => void handleDisableMfa(e)} className="space-y-4">
            <p className="text-nb-caption text-nb-on-surface-variant">
              Confirm your password to disable two-factor authentication on your account.
            </p>
            <TextField
              label="Current password"
              type="password"
              required
              value={mfaPassword}
              onChange={(e) => setMfaPassword(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={closeMfaModal}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="danger" disabled={mfaBusy || !mfaPassword}>
                {mfaBusy ? "Disabling…" : "Disable 2FA"}
              </Button>
            </div>
          </form>
        ) : totpUri || otpSent ? (
          <form onSubmit={(e) => void handleVerifyMfa(e)} className="space-y-4">
            {mfaMethod === "totp" && totpUri ? (
              <>
                <p className="text-nb-caption text-nb-on-surface-variant">
                  Scan this QR code with your authenticator app, or copy the setup key below:
                </p>
                <div className="flex justify-center rounded-nb-lg border border-nb-outline-variant/30 bg-white p-4">
                  <QRCodeSVG value={totpUri} size={160} />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low p-2.5">
                  <code className="truncate text-xs">
                    {(() => {
                      try {
                        return new URL(totpUri).searchParams.get("secret") || totpUri;
                      } catch {
                        return totpUri;
                      }
                    })()}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 gap-1"
                    onClick={() => {
                      let key = totpUri;
                      try {
                        key = new URL(totpUri).searchParams.get("secret") || totpUri;
                      } catch {
                        /* fallback */
                      }
                      void navigator.clipboard.writeText(key);
                      showNotification("Setup key copied.", "success");
                    }}
                  >
                    <Copy size={13} />
                    Copy key
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-nb-caption text-nb-on-surface-variant">
                Enter the 6-digit verification code sent to your email.
              </p>
            )}
            {backupCodes && backupCodes.length > 0 && (
              <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-nb-caption font-semibold">Save your backup codes:</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(backupCodes.join("\n"));
                      showNotification("Backup codes copied.", "success");
                    }}
                  >
                    <Copy size={13} />
                    Copy codes
                  </Button>
                </div>
                <p className="font-mono text-xs">{backupCodes.join("  ")}</p>
              </div>
            )}
            <TextField
              label="6-digit verification code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={closeMfaModal}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary" disabled={mfaBusy || !mfaCode.trim()}>
                {mfaBusy ? "Verifying…" : "Verify & enable"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleStartMfa(e)} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mfaMethod === "totp" ? "primary" : "secondary"}
                onClick={() => setMfaMethod("totp")}
              >
                Authenticator app
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mfaMethod === "otp" ? "primary" : "secondary"}
                onClick={() => setMfaMethod("otp")}
              >
                6-digit email code
              </Button>
            </div>
            <TextField
              label="Confirm current password"
              type="password"
              required
              value={mfaPassword}
              onChange={(e) => setMfaPassword(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={closeMfaModal}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary" disabled={mfaBusy || !mfaPassword}>
                {mfaBusy ? "Starting…" : "Continue"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Name Passkey Modal (after registration) */}
      <Dialog
        isOpen={passkeyModalOpen}
        onClose={() => {
          setPasskeyModalOpen(false);
          setEditingPasskeyId(null);
        }}
        title="Name your passkey"
      >
        <form onSubmit={(e) => void handleRenamePasskey(e)} className="space-y-4">
          <p className="text-nb-caption text-nb-on-surface-variant">
            Your passkey was registered. Optionally give it a name to identify this device later.
          </p>
          <TextField
            label="Passkey name"
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            placeholder="MacBook Touch ID"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPasskeyModalOpen(false);
                setEditingPasskeyId(null);
              }}
            >
              Skip
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={passkeyBusy}>
              {passkeyBusy ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
