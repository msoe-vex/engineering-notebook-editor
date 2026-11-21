"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { OrgCatalogManager } from "@/components/cloud/OrgCatalogManager";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { showNotification } from "@/components/overlays/Notification";
import {
  Button,
  Checkbox,
  FormSection,
  ImageField,
  Select,
  TabNav,
  TextField,
} from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { orgRoleLabel } from "@/lib/cloud/roles";

type SettingsTab = "general" | "public" | "social" | "danger";

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

  const [tab, setTab] = useState<SettingsTab>("general");
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

  const showSave = tab === "general" || tab === "public";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Settings</h2>
        <div className="flex flex-wrap items-center gap-3">
          {isDirty && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
          {showSave && (
            <>
              <Button variant="primary" disabled={busy || !isDirty} onClick={() => void save()}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
              {saved && !isDirty && (
                <span className="flex items-center gap-1 text-nb-label font-medium text-nb-success">
                  <Check size={14} /> Saved
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <TabNav
        activeId={tab}
        onSelect={(id) => setTab(id as SettingsTab)}
        items={[
          { id: "general", label: "General" },
          { id: "public", label: "Public site" },
          { id: "social", label: "Social" },
          { id: "danger", label: "Danger" },
        ]}
      />

      <div className="min-h-[28rem]">
      {tab === "general" && (
        <FormSection
          title="Organization"
          actions={
            org?.role ? (
              <span className="text-nb-caption text-nb-on-surface-variant">
                Your role ·{" "}
                <span className="font-semibold text-nb-on-surface">{orgRoleLabel(org.role)}</span>
              </span>
            ) : null
          }
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
          />
        </FormSection>
      )}

      {tab === "public" && (
        <FormSection
          title="Public site"
          actions={
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
                  View <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          }
        >
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="raider-robotics"
          />
          <Select
            label="Visibility"
            value={publicVisibility}
            onChange={(e) => setPublicVisibility(e.target.value as "public" | "hidden")}
          >
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </Select>
          <ImageField
            previewUrl={logoPreviewUrl}
            busy={busy}
            onUpload={(file) => void uploadLogo(file)}
            uploadLabel="Upload logo"
            replaceLabel="Replace logo"
            emptyLabel="Logo"
          />
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
            placeholder="About blurb"
          />
          <div className="grid gap-3 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/40 p-4">
            <p className="text-nb-label font-semibold text-nb-on-surface">Call to action</p>
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
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["About", sectionAbout, setSectionAbout],
                ["Donors", sectionDonors, setSectionDonors],
                ["Projects", sectionProjects, setSectionProjects],
                ["Events", sectionEvents, setSectionEvents],
                ["Members", sectionMembers, setSectionMembers],
                ["Social", sectionSocial, setSectionSocial],
              ] as const
            ).map(([label, on, setOn]) => (
              <Checkbox
                key={label}
                label={label}
                checked={on}
                onChange={(e) => setOn(e.target.checked)}
              />
            ))}
          </div>
        </FormSection>
      )}

      {tab === "social" && (
        <FormSection title="Social links">
          <OrgCatalogManager
            orgId={orgId}
            section="social-links"
            canManage={canManage}
            setError={setError}
            embedded
          />
        </FormSection>
      )}

      {tab === "danger" && (
        <section className="flex flex-col gap-4 rounded-nb-xl border border-nb-danger/30 bg-nb-danger/5 p-5">
          <div>
            <h3 className="text-nb-title font-semibold text-nb-danger">Danger zone</h3>
            <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
              Permanently delete this organization and all of its data.
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
      )}
      </div>

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
