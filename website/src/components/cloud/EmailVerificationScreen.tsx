"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, LogOut, CheckCircle2 } from "lucide-react";
import { sendEmailVerification, type User } from "@/lib/cloud/firebase";
import Logo from "@/components/icons/Logo";
import { Alert, Button } from "@/components/ui";

interface EmailVerificationScreenProps {
  user: User;
  onSignOut: () => void;
  onVerified: () => void;
  onBypass?: () => void;
}

export function EmailVerificationScreen({
  user,
  onSignOut,
  onVerified,
  onBypass,
}: EmailVerificationScreenProps) {
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleCheckStatus() {
    setChecking(true);
    setMessage(null);
    try {
      await user.reload();
      if (user.emailVerified) {
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
    if (cooldown > 0) return;
    setResending(true);
    setMessage(null);
    try {
      await sendEmailVerification(user);
      setMessage({
        type: "success",
        text: `A fresh verification link has been sent to ${user.email}. Check your inbox and spam folder.`,
      });
      setCooldown(60);
    } catch (err) {
      setMessage({
        type: "error",
        text: (err as Error).message || "Failed to send verification email.",
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

          <p className="text-nb-caption text-nb-on-surface-variant leading-relaxed">
            Please click the link in your email to verify your address and access your engineering
            notebooks. If you don&apos;t see the email, be sure to check your spam or promotions folder.
          </p>

          {message && (
            <Alert variant={message.type === "success" ? "info" : "error"}>
              <div className="flex items-center gap-2">
                {message.type === "success" && <CheckCircle2 size={16} className="shrink-0" />}
                <span>{message.text}</span>
              </div>
            </Alert>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              className="w-full justify-center"
              disabled={checking}
              onClick={() => void handleCheckStatus()}
            >
              <RefreshCw size={15} className={checking ? "animate-spin" : ""} />
              {checking ? "Checking..." : "I've verified my email"}
            </Button>

            <Button
              variant="secondary"
              className="w-full justify-center"
              disabled={resending || cooldown > 0}
              onClick={() => void handleResendEmail()}
            >
              <Mail size={15} />
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : resending
                ? "Sending..."
                : "Resend verification email"}
            </Button>
          </div>

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
                Running in local development / emulator?
              </p>
              <Button size="sm" variant="ghost" onClick={onBypass}>
                Bypass verification for dev
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

