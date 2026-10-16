"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { getFirebaseAuth } from "@/lib/cloud/firebase";

export default function AccountProfilePage() {
  const authUser = getFirebaseAuth().currentUser;
  const [displayName, setDisplayName] = useState("");
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
        setDisplayName(row.displayName || authUser?.displayName || "");
        setEmail(row.email || authUser?.email || "");
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayName(authUser?.displayName || "");
        setEmail(authUser?.email || "");
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.displayName, authUser?.email]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await cloudApi.patchMe({ displayName: displayName.trim() || undefined });
      setMessage("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
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
      <Button variant="primary" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
