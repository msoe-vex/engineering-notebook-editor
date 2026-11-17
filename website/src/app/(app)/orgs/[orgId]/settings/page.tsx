"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { showNotification } from "@/components/overlays/Notification";
import { Button, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { orgRoleLabel } from "@/lib/cloud/roles";

export default function OrgSettingsPage() {
  const router = useRouter();
  const {
    orgId,
    org,
    canManage,
    canDeleteOrg,
    refresh,
    setError,
    busy,
    setBusy,
  } = useOrgWorkspace();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [publicVisibility, setPublicVisibility] = useState<"public" | "hidden">("hidden");
  const [mission, setMission] = useState("");
  const [initialName, setInitialName] = useState("");
  const [initialSlug, setInitialSlug] = useState("");
  const [initialVisibility, setInitialVisibility] = useState<"public" | "hidden">("hidden");
  const [initialMission, setInitialMission] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (org?.name) {
      setName(org.name);
      setInitialName(org.name);
    }
    setSlug(org?.slug || "");
    setInitialSlug(org?.slug || "");
    const vis = org?.publicPage?.visibility === "public" ? "public" : "hidden";
    setPublicVisibility(vis);
    setInitialVisibility(vis);
    setMission(org?.publicPage?.mission || "");
    setInitialMission(org?.publicPage?.mission || "");
  }, [org?.name, org?.slug, org?.publicPage?.visibility, org?.publicPage?.mission]);

  const isDirty =
    (name.trim() !== initialName.trim() && name.trim().length > 0) ||
    slug.trim() !== initialSlug.trim() ||
    publicVisibility !== initialVisibility ||
    mission.trim() !== initialMission.trim();

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
        const ok = window.confirm(
          "You have unsaved changes in organization settings. Are you sure you want to leave?"
        );
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
    if (!name.trim()) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const body: Parameters<typeof cloudApi.patchOrg>[1] = {
        name: name.trim(),
        publicPage: {
          visibility: publicVisibility,
          mission: mission.trim() || undefined,
          announcement: org?.publicPage?.announcement,
          cta: org?.publicPage?.cta,
        },
      };
      if (slug.trim()) body.slug = slug.trim().toLowerCase();
      await cloudApi.patchOrg(orgId, body);
      setInitialName(name.trim());
      setInitialSlug(slug.trim().toLowerCase());
      setInitialVisibility(publicVisibility);
      setInitialMission(mission.trim());
      setSaved(true);
      refresh();
      showNotification("Organization updated", "success");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      showNotification(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-6 text-nb-body text-nb-on-surface-variant">
        Only organization admins and owners can access organization settings.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Organization settings</h2>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Manage your organization name and general preferences.
          </p>
        </div>
        {isDirty && (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">General</h3>
        <TextField
          label="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
        />
        <TextField
          label="Public slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="raider-robotics"
        />
        <p className="text-nb-caption text-nb-on-surface-variant">
          {slug.trim()
            ? `Public site: /o/${slug.trim().toLowerCase()}`
            : "Claim a unique URL for the public org page"}
        </p>
        <label className="flex flex-col gap-1 text-nb-label">
          <span className="font-medium">Public page visibility</span>
          <select
            className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2"
            value={publicVisibility}
            onChange={(e) => setPublicVisibility(e.target.value as "public" | "hidden")}
          >
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </select>
        </label>
        <TextField
          label="Mission (public)"
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="Short about blurb for /o/slug"
        />
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <a href={`/orgs/${orgId}/public`} className="text-nb-primary hover:underline">
            Edit public page content →
          </a>
          {slug.trim() && publicVisibility === "public" && (
            <a
              className="text-nb-primary hover:underline"
              href={`/o/${slug.trim().toLowerCase()}`}
              target="_blank"
              rel="noreferrer"
            >
              View public site ↗
            </a>
          )}
        </div>

        {org?.role && (
          <div className="flex items-center gap-2 text-nb-caption text-nb-on-surface-variant">
            <span>Your role in this organization:</span>
            <span className="font-semibold text-nb-on-surface">{orgRoleLabel(org.role)}</span>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || !isDirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {saved && !isDirty && (
          <span className="text-nb-label text-nb-success flex items-center gap-1 font-medium">
            <Check size={14} /> Saved
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4 rounded-nb-xl border border-nb-danger/30 bg-nb-danger/5 p-5">
        <div>
          <h3 className="text-nb-title font-semibold text-nb-danger">Danger Zone</h3>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Permanently delete this organization, including all notebooks, entries, assets, and teams. This action cannot be undone.
          </p>
        </div>

        {canDeleteOrg ? (
          <div>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => setDeleteConfirmOpen(true)}
              className="border-0 bg-nb-danger text-white hover:bg-nb-danger-dim"
            >
              <Trash2 size={16} className="mr-1.5" />
              Delete this organization
            </Button>
          </div>
        ) : (
          <p className="text-nb-caption text-nb-on-surface-variant">
            Only organization owners can delete this organization.
          </p>
        )}
      </section>

      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title="Delete organization?"
        message={`Delete “${org?.name || "this organization"}” and all notebooks, entries, and teams? This action is permanent and cannot be undone.`}
        confirmLabel="Delete organization"
        confirmText={org?.name}
        confirmTextPlaceholder={org?.name}
        variant="danger"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteConfirmOpen(false);
          setBusy(true);
          try {
            await cloudApi.deleteOrg(orgId);
            showNotification("Organization deleted", "success");
            router.push("/");
          } catch (err) {
            const msg = (err as Error).message;
            setError(msg);
            showNotification(msg, "error");
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

