"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { showNotification } from "@/components/overlays/Notification";
import { Alert, Button, Dialog, LoadingBlock, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";

type SectionKey = "donors" | "projects" | "events" | "social";

type CmsItem = Record<string, unknown> & { id: string };

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  url: "URL",
  tier: "Tier",
  title: "Title",
  season: "Season",
  summary: "Summary",
  externalUrl: "External URL",
  kind: "Kind",
  location: "Location",
  date: "Date",
  label: "Label",
};

const SECTIONS: {
  key: SectionKey;
  label: string;
  fields: string[];
  imageField: string;
}[] = [
  {
    key: "donors",
    label: "Donors",
    fields: ["name", "url", "tier"],
    imageField: "imageAssetId",
  },
  {
    key: "projects",
    label: "Projects",
    fields: ["title", "season", "summary", "externalUrl"],
    imageField: "imageAssetId",
  },
  {
    key: "events",
    label: "Events",
    fields: ["title", "kind", "location", "date"],
    imageField: "imageAssetId",
  },
  {
    key: "social",
    label: "Social links",
    fields: ["label", "url"],
    imageField: "imageAssetId",
  },
];

function publicAbout(pp?: { about?: string; mission?: string } | null) {
  return (pp?.about || pp?.mission || "").trim();
}

function absolutePublicUrl(path: string) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification("Link copied", "success");
  } catch {
    showNotification("Could not copy", "error");
  }
}

function itemPrimaryLabel(item: CmsItem, fields: string[]) {
  for (const f of fields) {
    const v = item[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Untitled item";
}

export default function OrgPublicCmsPage() {
  const { orgId, org, canManage, refresh, setError } = useOrgWorkspace();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementHref, setAnnouncementHref] = useState("");
  const [about, setAbout] = useState("");
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaBody, setCtaBody] = useState("");
  const [ctaJoin, setCtaJoin] = useState("");
  const [ctaDonate, setCtaDonate] = useState("");
  const [visibility, setVisibility] = useState<"public" | "hidden">("hidden");
  const [logoAssetId, setLogoAssetId] = useState<string | undefined>();
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<SectionKey, CmsItem[]>>({
    donors: [],
    projects: [],
    events: [],
    social: [],
  });
  const [editor, setEditor] = useState<{
    section: SectionKey;
    mode: "add" | "edit";
    id?: string;
    values: Record<string, string>;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<{ section: SectionKey; id: string } | null>(null);
  const [itemImageUrls, setItemImageUrls] = useState<Record<string, string>>({});

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

  const load = useCallback(() => {
    setLoading(true);
    void cloudApi
      .getOrgPublicCms(orgId)
      .then((data) => {
        const o = (data.org || {}) as {
          slug?: string;
          publicPage?: {
            visibility?: string;
            about?: string;
            mission?: string;
            logoAssetId?: string;
            announcement?: { text?: string; href?: string };
            cta?: { title?: string; body?: string; joinUrl?: string; donateUrl?: string };
          };
        };
        const pp = o.publicPage || org?.publicPage;
        setSlug((o.slug || org?.slug || "").trim());
        setVisibility(pp?.visibility === "public" ? "public" : "hidden");
        setAbout(publicAbout(pp));
        const nextLogo = pp?.logoAssetId;
        setLogoAssetId(nextLogo);
        loadLogoPreview(nextLogo);
        setAnnouncement(pp?.announcement?.text || "");
        setAnnouncementHref(pp?.announcement?.href || "");
        setCtaTitle(pp?.cta?.title || "");
        setCtaBody(pp?.cta?.body || "");
        setCtaJoin(pp?.cta?.joinUrl || "");
        setCtaDonate(pp?.cta?.donateUrl || "");
        const nextSections = {
          donors: (data.donors as CmsItem[]) || [],
          projects: (data.projects as CmsItem[]) || [],
          events: (data.events as CmsItem[]) || [],
          social: (data.social as CmsItem[]) || [],
        };
        setSections(nextSections);
        const assetIds = new Set<string>();
        for (const sec of SECTIONS) {
          for (const item of nextSections[sec.key]) {
            const aid = item[sec.imageField];
            if (typeof aid === "string" && aid) assetIds.add(aid);
          }
        }
        void Promise.all(
          [...assetIds].map(async (assetId) => {
            try {
              const { url } = await cloudApi.getOrgAssetUrl(orgId, assetId);
              return [assetId, url] as const;
            } catch {
              return null;
            }
          })
        ).then((pairs) => {
          const map: Record<string, string> = {};
          for (const p of pairs) if (p) map[p[0]] = p[1];
          setItemImageUrls(map);
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [orgId, org?.publicPage, org?.slug, setError, loadLogoPreview]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  async function savePageMeta(includeSlug = true) {
    setBusy(true);
    try {
      const body: Parameters<typeof cloudApi.patchOrg>[1] = {
        publicPage: {
          visibility,
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
        },
      };
      if (includeSlug && slug.trim()) {
        body.slug = slug.trim().toLowerCase();
      }
      await cloudApi.patchOrg(orgId, body);
      await refresh();
      showNotification("Public page updated", "success");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      showNotification(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveItem() {
    if (!editor) return;
    const sec = SECTIONS.find((s) => s.key === editor.section);
    if (!sec) return;
    const body: Record<string, unknown> = { ...editor.values };
    if (editor.mode === "add") {
      body.order = sections[editor.section].length;
    } else if (editor.id) {
      const existing = sections[editor.section].find((i) => i.id === editor.id);
      if (existing?.[sec.imageField]) {
        body[sec.imageField] = existing[sec.imageField];
      }
    }
    setBusy(true);
    try {
      await cloudApi.upsertPublicItem(
        orgId,
        editor.section,
        editor.mode === "add" ? "new" : editor.id || "new",
        body
      );
      setEditor(null);
      load();
      showNotification(editor.mode === "add" ? "Item added" : "Item updated", "success");
    } catch (err) {
      setError((err as Error).message);
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(section: SectionKey, id: string) {
    setBusy(true);
    try {
      await cloudApi.deletePublicItem(orgId, section, id);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadItemPhoto(section: SectionKey, itemId: string, file: File) {
    const sec = SECTIONS.find((s) => s.key === section);
    if (!sec?.imageField) return;
    setBusy(true);
    try {
      const { asset } = await cloudApi.createOrgAsset(orgId, {
        contentType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      await cloudApi.uploadOrgAssetContent(orgId, asset.id, file, file.type || "image/jpeg");
      const item = sections[section].find((i) => i.id === itemId);
      await cloudApi.upsertPublicItem(orgId, section, itemId, {
        ...(item || {}),
        [sec.imageField]: asset.id,
      });
      load();
      showNotification("Image attached", "success");
    } catch (err) {
      setError((err as Error).message);
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
      await cloudApi.patchOrg(orgId, {
        publicPage: {
          visibility,
          about: about.trim() || undefined,
          logoAssetId: asset.id,
          announcement: announcement.trim()
            ? { text: announcement.trim(), href: announcementHref.trim() || undefined }
            : undefined,
          cta: {
            title: ctaTitle.trim() || undefined,
            body: ctaBody.trim() || undefined,
            joinUrl: ctaJoin.trim() || undefined,
            donateUrl: ctaDonate.trim() || undefined,
          },
        },
      });
      await refresh();
      showNotification("Logo updated", "success");
    } catch (err) {
      setError((err as Error).message);
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-6 text-nb-body text-nb-on-surface-variant">
        Only organization admins and owners can edit the public page.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <LoadingBlock label="Loading public CMS…" />
      </div>
    );
  }

  const slugTrim = slug.trim().toLowerCase();
  const canView = Boolean(slugTrim) && visibility === "public";
  const publicPath = slugTrim ? `/o/${slugTrim}` : "";
  const editorSec = editor ? SECTIONS.find((s) => s.key === editor.section) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = photoTarget;
          e.target.value = "";
          setPhotoTarget(null);
          if (file && target) void uploadItemPhoto(target.section, target.id, file);
        }}
      />
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Public page</h2>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Edit the marketing site
            {slugTrim ? (
              <>
                {" "}
                at <code className="text-nb-caption">{publicPath}</code>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {slugTrim ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void copyText(absolutePublicUrl(publicPath))}
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

      <section className="flex flex-col gap-4">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Public URL</h3>
        <TextField
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="raider-robotics"
        />
        <p className="text-nb-caption text-nb-on-surface-variant">
          {slugTrim
            ? `Public site: /o/${slugTrim}`
            : "Choose a unique URL segment for /o/your-slug"}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !slugTrim}
          onClick={() => void savePageMeta(true)}
        >
          Save URL
        </Button>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Home content</h3>
        <label className="flex flex-col gap-1 text-nb-label">
          <span className="font-medium">Visibility</span>
          <select
            className="rounded-nb-lg border border-nb-outline-variant/40 bg-nb-surface-low px-3 py-2"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "hidden")}
          >
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
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
            <div>
              <p className="text-nb-label font-medium">Logo</p>
              <p className="text-nb-caption text-nb-on-surface-variant">
                {logoAssetId ? "Logo on file — shown on the public site header" : "No logo yet"}
              </p>
            </div>
          </div>
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
          <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
            Buttons for join / donate links on the public home.
          </p>
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
        <Button variant="primary" disabled={busy} onClick={() => void savePageMeta(true)}>
          {busy ? "Saving…" : "Save home content"}
        </Button>
      </section>

      <section className="rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface-low/40 px-4 py-3">
        <h3 className="text-nb-body font-semibold text-nb-on-surface">Public members</h3>
        <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
          Every org member (including alumni) appears on the public roster. Set each person’s
          credits title and photo under{" "}
          <Link href={`/orgs/${orgId}/people`} className="font-semibold text-nb-primary hover:underline">
            People
          </Link>
          . Alumni is a cosmetic label — they can still be notebook contributors.
        </p>
      </section>

      {SECTIONS.map((sec) => (
        <section key={sec.key} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-nb-body font-semibold text-nb-on-surface">{sec.label}</h3>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                setEditor({
                  section: sec.key,
                  mode: "add",
                  values: Object.fromEntries(sec.fields.map((f) => [f, ""])),
                })
              }
            >
              <Plus size={14} /> Add
            </Button>
          </div>
          <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
            {sections[sec.key].map((item) => {
              const assetId =
                typeof item[sec.imageField] === "string" ? String(item[sec.imageField]) : "";
              const thumb = assetId ? itemImageUrls[assetId] : undefined;
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-nb-body">
                  <div className="flex min-w-0 items-start gap-3">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="mt-0.5 h-10 w-10 shrink-0 rounded-nb-md object-cover ring-1 ring-nb-outline-variant/30"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-nb-md bg-nb-surface-low text-[10px] font-semibold text-nb-on-surface-variant ring-1 ring-nb-outline-variant/20">
                        —
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium text-nb-on-surface">
                        {itemPrimaryLabel(item, sec.fields)}
                      </p>
                      {sec.fields.slice(1).map((f) =>
                        item[f] ? (
                          <p key={f} className="truncate text-nb-caption text-nb-on-surface-variant">
                            {FIELD_LABELS[f] || f}: {String(item[f])}
                          </p>
                        ) : null
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      title="Edit"
                      onClick={() =>
                        setEditor({
                          section: sec.key,
                          mode: "edit",
                          id: item.id,
                          values: Object.fromEntries(
                            sec.fields.map((f) => [f, item[f] != null ? String(item[f]) : ""])
                          ),
                        })
                      }
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      title="Upload image"
                      onClick={() => {
                        setPhotoTarget({ section: sec.key, id: item.id });
                        photoInputRef.current?.click();
                      }}
                    >
                      <Camera size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-nb-danger"
                      disabled={busy}
                      onClick={() => void removeItem(sec.key, item.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              );
            })}
            {!sections[sec.key].length && (
              <li className="px-4 py-6 text-center text-nb-on-surface-variant text-nb-caption">
                No items yet.
              </li>
            )}
          </ul>
        </section>
      ))}

      <Dialog
        isOpen={Boolean(editor && editorSec)}
        onClose={() => !busy && setEditor(null)}
        title={
          editor && editorSec
            ? editor.mode === "add"
              ? `Add ${editorSec.label.replace(/s$/, "").toLowerCase()}`
              : `Edit ${editorSec.label.replace(/s$/, "").toLowerCase()}`
            : undefined
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void saveItem()}>
              {busy ? "Saving…" : editor?.mode === "add" ? "Add" : "Save"}
            </Button>
          </div>
        }
      >
        {editor && editorSec ? (
          <div className="grid gap-3">
            {editorSec.fields.map((f) => (
              <TextField
                key={f}
                label={FIELD_LABELS[f] || f}
                value={editor.values[f] || ""}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev
                      ? { ...prev, values: { ...prev.values, [f]: e.target.value } }
                      : prev
                  )
                }
              />
            ))}
            <p className="text-nb-caption text-nb-on-surface-variant">
              After saving, use the camera button on the row to upload an image.
            </p>
          </div>
        ) : null}
      </Dialog>

      {!slugTrim && (
        <Alert variant="warning">
          Set a unique public slug above before the public site can be opened.{" "}
          <Link href={`/orgs/${orgId}/settings`} className="font-semibold underline">
            Settings
          </Link>{" "}
          also edits the same slug.
        </Alert>
      )}
    </div>
  );
}
