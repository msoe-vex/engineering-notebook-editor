"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { getFirebaseAuth, linkProvider, unlinkProvider } from "@/lib/cloud/firebase";
import { showNotification } from "@/components/overlays/Notification";

type Secondary = { email: string; verified: boolean; verifiedAt?: string; addedAt?: string };

export default function AccountProfilePage() {
  const authUser = getFirebaseAuth().currentUser;
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [secondaries, setSecondaries] = useState<Secondary[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);

  function refreshProfile() {
    return cloudApi
      .me()
      .then((u) => {
        const row = u as {
          displayName?: string;
          email?: string;
          secondaryEmails?: Secondary[];
        };
        const name = row.displayName || authUser?.displayName || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(row.email || authUser?.email || "");
        setSecondaries(row.secondaryEmails || []);
      })
      .catch(() => {
        const name = authUser?.displayName || "";
        setDisplayName(name);
        setInitialDisplayName(name);
        setEmail(authUser?.email || "");
      });
  }

  useEffect(() => {
    let cancelled = false;
    void refreshProfile().finally(() => {
      if (!cancelled && authUser) {
        setProviders(authUser.providerData.map((p) => p.providerId));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.displayName, authUser?.email]);

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

  async function link(provider: "google" | "github") {
    try {
      await linkProvider(provider);
      setProviders(getFirebaseAuth().currentUser?.providerData.map((p) => p.providerId) || []);
      showNotification(`Linked ${provider}`, "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    }
  }

  async function unlink(providerId: string) {
    try {
      await unlinkProvider(providerId);
      setProviders(getFirebaseAuth().currentUser?.providerData.map((p) => p.providerId) || []);
      showNotification("Provider unlinked", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
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
        <TextField label="Primary email" value={email} disabled readOnly />
        <p className="text-nb-caption text-nb-on-surface-variant">
          Primary email comes from your sign-in provider. Verified secondary emails can match org invites.
        </p>
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
        <p className="text-nb-caption text-nb-on-surface-variant">
          Google / GitHub linking requires providers enabled in Firebase (limited on Auth emulator).
        </p>
        <ul className="space-y-2 text-nb-caption text-nb-on-surface-variant">
          {providers.length ? (
            providers.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-nb-on-surface">{id}</span>
                {(id === "google.com" || id === "github.com") && (
                  <Button size="sm" variant="ghost" onClick={() => void unlink(id)}>
                    Unlink
                  </Button>
                )}
              </li>
            ))
          ) : (
            <li>password / email only</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          {!providers.includes("google.com") && (
            <Button size="sm" variant="secondary" onClick={() => void link("google")}>
              Link Google
            </Button>
          )}
          {!providers.includes("github.com") && (
            <Button size="sm" variant="secondary" onClick={() => void link("github")}>
              Link GitHub
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
