"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { OrgCatalogManager } from "@/components/cloud/OrgCatalogManager";
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
  const [about, setAbout] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementHref, setAnnouncementHref] = useState("");
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaBody, setCtaBody] = useState("");
  const [ctaJoin, setCtaJoin] = useState("");
  const [ctaDonate, setCtaDonate] = useState("");
  const [logoAssetId, setLogoAssetId] = useState<string | undefined>();
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [sectionAbout, setSectionAbout] = useState(true);
  const [sectionDonors, setSectionDonors] = useState(true);
  const [sectionProjects, setSectionProjects] = useState(true);
  const [sectionEvents, setSectionEvents] = useState(true);
  const [sectionMembers, setSectionMembers] = useState(true);
  const [sectionSocial, setSectionSocial] = useState(true);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadLogoPreview = useCallback(
    (assetId?: string) => {
      if (!assetId) {
        setLogoPreviewUrl(null);
        return;
      }
      void cloudApi
        .getOrgAssetUrl(orgId, assetId)
        .then(({ url }) => setLogoPreviewUrl(url))
        .catch(() => setLogoPreviewUrl(null));
    },
    [orgId]
  );

  useEffect(() => {
    if (!org) return;
    setName(org.name || "");
    setSlug(org.slug || "");
    const vis = org.publicPage?.visibility === "public" ? "public" : "hidden";
    setPublicVisibility(vis);
    const aboutText = org.publicPage?.about || org.publicPage?.mission || "";
    setAbout(aboutText);
    setAnnouncement(org.publicPage?.announcement?.text || "");
    setAnnouncementHref(org.publicPage?.announcement?.href || "");
    setCtaTitle(org.publicPage?.cta?.title || "");
    setCtaBody(org.publicPage?.cta?.body || "");
    setCtaJoin(org.publicPage?.cta?.joinUrl || "");
    setCtaDonate(org.publicPage?.cta?.donateUrl || "");
    setLogoAssetId(org.publicPage?.logoAssetId);
    loadLogoPreview(org.publicPage?.logoAssetId);
    const secs = org.publicPage?.sections;
    const aboutOn = secs?.about !== false;
    const donorsOn = secs?.donors !== false;
    const projectsOn = secs?.projects !== false;
    const eventsOn = secs?.events !== false;
    const membersOn = secs?.members !== false;
    const socialOn = secs?.social !== false;
    setSectionAbout(aboutOn);
    setSectionDonors(donorsOn);
    setSectionProjects(projectsOn);
    setSectionEvents(eventsOn);
    setSectionMembers(membersOn);
    setSectionSocial(socialOn);
    setInitialSnapshot(
      JSON.stringify({
        name: org.name || "",
        slug: org.slug || "",
        vis,
        about: aboutText,
        announcement: org.publicPage?.announcement?.text || "",
        announcementHref: org.publicPage?.announcement?.href || "",
        ctaTitle: org.publicPage?.cta?.title || "",
        ctaBody: org.publicPage?.cta?.body || "",
        ctaJoin: org.publicPage?.cta?.joinUrl || "",
        ctaDonate: org.publicPage?.cta?.donateUrl || "",
        logoAssetId: org.publicPage?.logoAssetId || "",
        sectionAbout: aboutOn,
        sectionDonors: donorsOn,
        sectionProjects: projectsOn,
        sectionEvents: eventsOn,
        sectionMembers: membersOn,
        sectionSocial: socialOn,
      })
    );
  }, [org, loadLogoPreview]);

  const currentSnapshot = JSON.stringify({
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    vis: publicVisibility,
    about: about.trim(),
    announcement: announcement.trim(),
    announcementHref: announcementHref.trim(),
    ctaTitle: ctaTitle.trim(),
    ctaBody: ctaBody.trim(),
    ctaJoin: ctaJoin.trim(),
    ctaDonate: ctaDonate.trim(),
    logoAssetId: logoAssetId || "",
    sectionAbout,
    sectionDonors,
    sectionProjects,
    sectionEvents,
    sectionMembers,
    sectionSocial,
  });
  const isDirty = currentSnapshot !== initialSnapshot && name.trim().length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
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
          about: about.trim() || undefined,
          logoAssetId,
          announcement: announcement.trim()
            ? { text: announcement.trim(), href: announcementHref.trim() || undefined }
            : undefined,
          cta: {
            title: ctaTitle.trim() || undefined,
            body: ctaBody.trim() || undefined,
            joinUrl: ctaJoin.trim() || undefined,
            donateUrl: ctaDonate.trim() || undefined,
          },
          sections: {
            about: sectionAbout,
            donors: sectionDonors,
            projects: sectionProjects,
            events: sectionEvents,
            members: sectionMembers,
            social: sectionSocial,
          },
        },
      };
      if (slug.trim()) body.slug = slug.trim().toLowerCase();
      await cloudApi.patchOrg(orgId, body);
      setInitialSnapshot(currentSnapshot);
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

  async function uploadLogo(file: File) {
    setBusy(true);
    try {
      const { asset } = await cloudApi.createOrgAsset(orgId, {
        contentType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      await cloudApi.uploadOrgAssetContent(orgId, asset.id, file, file.type || "image/jpeg");
      setLogoAssetId(asset.id);
      loadLogoPreview(asset.id);
      showNotification("Logo uploaded — save settings to apply", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const slugTrim = slug.trim().toLowerCase();
  const canView = Boolean(slugTrim) && publicVisibility === "public";
  const publicPath = slugTrim ? `/o/${slugTrim}` : "";

  if (!canManage) {
    return (
      <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-6 text-nb-body text-nb-on-surface-variant">
        Only organization admins and owners can access organization settings.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void uploadLogo(file);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">
            Organization settings
          </h2>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Name, public site chrome, and social links. Donors, projects, and events have their own
            tabs.
          </p>
        </div>
        {isDirty && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-nb-body font-semibold text-nb-on-surface">Public site</h3>
          <div className="flex flex-wrap items-center gap-2">
            {slugTrim ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const url = `${window.location.origin}${publicPath}`;
                  void navigator.clipboard.writeText(url).then(
                    () => showNotification("Link copied", "success"),
                    () => showNotification("Could not copy", "error")
                  );
                }}
              >
                <Copy size={14} /> Copy link
              </Button>
            ) : null}
            {canView ? (
              <a
                href={publicPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-nb-primary hover:underline"
              >
                View public site <ExternalLink size={14} />
              </a>
            ) : (
              <span className="text-sm text-nb-on-surface-variant">
                {slugTrim ? "Visibility is hidden" : "Claim a slug below"}
              </span>
            )}
          </div>
        </div>

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
          {slugTrim ? `Public site: /o/${slugTrim}` : "Claim a unique URL for the public org page"}
        </p>
        <label className="flex flex-col gap-1 text-nb-label">
          <span className="font-medium">Visibility</span>
          <select
            className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2"
            value={publicVisibility}
            onChange={(e) => setPublicVisibility(e.target.value as "public" | "hidden")}
          >
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-4">
          {logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreviewUrl}
              alt="Organization logo"
              className="h-16 w-16 rounded-nb-lg object-cover ring-1 ring-nb-outline-variant/40"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-nb-lg bg-nb-surface-low text-nb-caption font-semibold text-nb-on-surface-variant ring-1 ring-nb-outline-variant/30">
              No logo
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => logoInputRef.current?.click()}
          >
            <Camera size={14} /> {logoAssetId ? "Replace logo" : "Upload logo"}
          </Button>
        </div>

        <TextField
          label="Announcement"
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          placeholder="Banner text"
        />
        <TextField
          label="Announcement link"
          value={announcementHref}
          onChange={(e) => setAnnouncementHref(e.target.value)}
          placeholder="https://…"
        />
        <TextField
          label="About"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="Short about blurb for the public home"
        />
        <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/40 p-4">
          <h4 className="text-nb-label font-semibold text-nb-on-surface">Call to action</h4>
          <div className="mt-3 grid gap-3">
            <TextField
              label="Heading"
              value={ctaTitle}
              onChange={(e) => setCtaTitle(e.target.value)}
              placeholder="Get involved"
            />
            <TextField
              label="Supporting text"
              value={ctaBody}
              onChange={(e) => setCtaBody(e.target.value)}
            />
            <TextField
              label="Join link"
              value={ctaJoin}
              onChange={(e) => setCtaJoin(e.target.value)}
              placeholder="https://…"
            />
            <TextField
              label="Donate link"
              value={ctaDonate}
              onChange={(e) => setCtaDonate(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/40 p-4">
          <h4 className="text-nb-label font-semibold text-nb-on-surface">Public sections</h4>
          <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
            Turn off a whole section on the public site. Individual items still have their own Public
            toggles when the section is on.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["About", sectionAbout, setSectionAbout],
                ["Donors", sectionDonors, setSectionDonors],
                ["Projects", sectionProjects, setSectionProjects],
                ["Events", sectionEvents, setSectionEvents],
                ["Members", sectionMembers, setSectionMembers],
                ["Social links", sectionSocial, setSectionSocial],
              ] as const
            ).map(([label, on, setOn]) => (
              <li key={label}>
                <label className="flex cursor-pointer items-center gap-2 text-nb-body text-nb-on-surface">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-nb-outline-variant"
                    checked={on}
                    onChange={(e) => setOn(e.target.checked)}
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        {org?.role && (
          <div className="flex items-center gap-2 text-nb-caption text-nb-on-surface-variant">
            <span>Your role in this organization:</span>
            <span className="font-semibold text-nb-on-surface">{orgRoleLabel(org.role)}</span>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy || !isDirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {saved && !isDirty && (
          <span className="flex items-center gap-1 text-nb-label font-medium text-nb-success">
            <Check size={14} /> Saved
          </span>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Social links</h3>
        <OrgCatalogManager
          orgId={orgId}
          section="social-links"
          canManage={canManage}
          setError={setError}
          embedded
        />
      </section>

      <section className="flex flex-col gap-4 rounded-nb-xl border border-nb-danger/30 bg-nb-danger/5 p-5">
        <div>
          <h3 className="text-nb-title font-semibold text-nb-danger">Danger Zone</h3>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Permanently delete this organization, including all notebooks, entries, assets, and
            teams. This action cannot be undone.
          </p>
        </div>
        {canDeleteOrg ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => setDeleteConfirmOpen(true)}
            className="border-0 bg-nb-danger text-white hover:bg-nb-danger-dim"
          >
            <Trash2 size={16} className="mr-1.5" />
            Delete this organization
          </Button>
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
