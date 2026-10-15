"use client";

import { useRouter } from "next/navigation";
import SettingsPage from "@/components/pages/SettingsPage";
import { PageHeader } from "@/components/ui";

/**
 * User-scoped profile / preferences (theme, GenAI BYOK, default authors).
 * Notebook Team (identity/roster/phases) stays under the notebook ActivityBar.
 */
export default function AccountPage() {
  const router = useRouter();

  return (
    <div className="font-sans">
      <PageHeader
        backHref="/"
        backLabel="Organizations"
        title="Account"
        description="Your preferences apply across all organizations and notebooks."
      />
      <div className="overflow-hidden rounded-2xl border border-nb-outline-variant/30 bg-nb-surface">
        <SettingsPage isEmbedded onClose={() => router.push("/")} />
      </div>
    </div>
  );
}
