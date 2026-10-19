"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { getFirebaseAuth } from "@/lib/cloud/firebase";

export default function AccountProfilePage() {
  const authUser = getFirebaseAuth().currentUser;
  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cloudApi
      .me()
      .then((u) => {
        if (cancelled) return;
        const row = u as { displayName?: string; email?: string };
        const name = row.displayName || authUser?.displayName || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(row.email || authUser?.email || "");
      })
      .catch(() => {
        if (cancelled) return;
        const name = authUser?.displayName || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(authUser?.email || "");
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.displayName, authUser?.email]);

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
        const ok = window.confirm("You have unsaved changes in your profile. Are you sure you want to leave?");
        if (!ok) {
          e.preventDefault();
          e.stopPropagation();
        }
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
      if (authUser && name) {
        try {
          const { updateProfile } = await import("@/lib/cloud/firebase");
          await updateProfile(authUser, { displayName: name });
        } catch {
          // ignore
        }
      }
      setMessage("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
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

      <section className="space-y-3">
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
        <TextField label="Email" value={email} disabled readOnly />
        <p className="text-nb-caption text-nb-on-surface-variant">
          Email comes from your sign-in provider. Display name syncs to your cloud profile.
        </p>
      </section>
      {error && <p className="text-nb-caption text-nb-danger">{error}</p>}
      {message && <p className="text-nb-caption text-nb-primary">{message}</p>}
      <Button variant="primary" disabled={saving || !isDirty} onClick={() => void save()}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
