"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, LogOut, CheckCircle2 } from "lucide-react";
import Logo from "@/components/icons/Logo";
import { Alert, Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { authClient, peekSession } from "@/lib/auth/client";
import { useAppSession } from "@/lib/auth/sessionContext";

interface UserLike {
  email?: string | null;
  emailVerified?: boolean;
  needsEmailOnboarding?: boolean;
  reload?: () => Promise<void>;
}

interface EmailVerificationScreenProps {
  user: UserLike;
  onSignOut: () => void;
  onVerified: () => void;
  onBypass?: () => void;
}

const COOLDOWN_KEY = "ene_email_verify_cooldown_until";
const COOLDOWN_SEC = 60;

function readCooldownRemaining(): number {
  if (typeof window === "undefined") return 0;
  try {
    const until = Number(sessionStorage.getItem(COOLDOWN_KEY) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

function writeCooldown(sec: number) {
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + sec * 1000));
  } catch {
    /* ignore */
  }
}

export function EmailVerificationScreen({
  user,
  onSignOut,
  onVerified,
  onBypass,
}: EmailVerificationScreenProps) {
  const { refetch: refetchSession } = useAppSession();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [onboardingEmail, setOnboardingEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSaveOnboardingEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = onboardingEmail.trim();
    if (!trimmed) return;
    setSavingEmail(true);
    setMessage(null);
    try {
      const res = await authClient.changeEmail({
        newEmail: trimmed,
        callbackURL: typeof window !== "undefined" ? window.location.origin : "/",
      });
      if (res?.error) {
        throw new Error(res.error.message || "Failed to update email.");
      }
      await authClient.updateUser({
        needsEmailOnboarding: false,
      } as Record<string, unknown>);
      await refetchSession();
      setMessage({
        type: "success",
        text: `Verification link sent to ${trimmed}. Check your inbox and spam folder.`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message || "Failed to update email.",
      });
    } finally {
      setSavingEmail(false);
    }
  }

  useEffect(() => {
    setCooldown(readCooldownRemaining());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      const left = readCooldownRemaining();
      setCooldown(left);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleCheckStatus() {
    setChecking(true);
    setMessage(null);
    try {
      if (user.reload) await user.reload();
      await refetchSession();
      const peeked = peekSession()?.user as { emailVerified?: boolean } | undefined;
      const verified = Boolean(peeked?.emailVerified || user.emailVerified);
      if (verified) {
        onVerified();
      } else {
        setMessage({
          type: "error",
          text: "We haven't detected your verification yet. Please click the link in your email and try again.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message || "Failed to check verification status.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleResendEmail() {
    if (cooldown > 0 || !user.email) return;
    setResending(true);
    setMessage(null);
    try {
      // Server gate (per-uid rate limit) then IdP/Better Auth send.
      await cloudApi.resendEmailVerificationGate();
      const result = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: typeof window !== "undefined" ? window.location.origin : "/",
      });
      if (result?.error) {
        throw new Error(result.error.message || "Failed to send verification email.");
      }
      writeCooldown(COOLDOWN_SEC);
      setCooldown(COOLDOWN_SEC);
      setMessage({
        type: "success",
        text: `A fresh verification link has been sent to ${user.email}. Check your inbox and spam folder.`,
      });
    } catch (err) {
      const e = err as Error & { status?: number; retryAfterSec?: number };
      if (e.message?.includes("too many") || e.message?.includes("rate_limited")) {
        const sec = e.retryAfterSec || COOLDOWN_SEC;
        writeCooldown(sec);
        setCooldown(sec);
      }
      setMessage({
        type: "error",
        text: e.message || "Failed to send verification email.",
      });
    } finally {
      setResending(false);
    }
  }

  const isLocalDev =
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));

  return (
    <div className="cloud-shell min-h-screen bg-nb-surface text-nb-on-surface">
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-nb-primary shadow-lg shadow-nb-primary/25">
            <Logo className="text-white" size={28} strokeWidth={18} />
          </div>
          <div>
            <p className="text-nb-label font-semibold text-nb-on-surface-variant">Security</p>
            <h1 className="text-nb-display font-bold tracking-tight">Verify your email</h1>
          </div>
        </div>

        <div className="rounded-nb-2xl border border-nb-outline-variant/30 bg-nb-surface p-6 shadow-sm flex flex-col gap-5">
          {user.needsEmailOnboarding ? (
            <form onSubmit={(e) => void handleSaveOnboardingEmail(e)} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nb-primary/10 text-nb-primary">
                  <Mail size={20} />
                </div>
                <div>
                  <p className="text-nb-body font-semibold text-nb-on-surface">
                    Complete your account
                  </p>
                  <p className="text-nb-caption text-nb-on-surface-variant">
                    Your sign-in provider didn&apos;t share an email address. Enter your email to continue.
                  </p>
                </div>
              </div>
              <TextField
                label="Email address"
                type="email"
                required
                value={onboardingEmail}
                onChange={(e) => setOnboardingEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {message && (
                <Alert variant={message.type === "success" ? "info" : "error"}>
                  {message.text}
                </Alert>
              )}
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={savingEmail || !onboardingEmail.trim()}
              >
                {savingEmail ? "Saving…" : "Continue & verify email"}
              </Button>
            </form>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nb-primary/10 text-nb-primary">
                  <Mail size={20} />
                </div>
                <div>
                  <p className="text-nb-body text-nb-on-surface">
                    We sent a verification link to:
                  </p>
                  <p className="font-semibold text-nb-on-surface break-all">{user.email}</p>
                </div>
              </div>

              {message && (
                <Alert variant={message.type === "success" ? "info" : "error"}>
                  {message.type === "success" && (
                    <CheckCircle2 className="inline h-4 w-4 mr-1" />
                  )}
                  {message.text}
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  disabled={checking}
                  onClick={() => void handleCheckStatus()}
                >
                  {checking ? "Checking…" : "I've verified — continue"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center gap-2"
                  disabled={resending || cooldown > 0}
                  onClick={() => void handleResendEmail()}
                >
                  <RefreshCw size={14} className={resending ? "animate-spin" : undefined} />
                  {cooldown > 0
                    ? `Resend available in ${cooldown}s`
                    : resending
                      ? "Sending…"
                      : "Resend verification email"}
                </Button>
              </div>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-nb-outline-variant/20 pt-4 text-nb-caption">
            <span className="text-nb-on-surface-variant">Wrong email?</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-nb-danger hover:underline"
              onClick={onSignOut}
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>

          {isLocalDev && onBypass && (
            <div className="mt-2 rounded-nb-lg border border-dashed border-nb-outline-variant/40 bg-nb-surface-low p-3 text-center">
              <p className="text-nb-caption text-nb-on-surface-variant mb-2">
                Local development only
              </p>
              <Button size="sm" variant="ghost" onClick={onBypass}>
                Skip verification
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
