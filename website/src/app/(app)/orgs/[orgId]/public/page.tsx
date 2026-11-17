"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { showNotification } from "@/components/overlays/Notification";
import { Alert, Button, LoadingBlock, TextField } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";

type SectionKey = "donors" | "projects" | "events" | "members" | "social";

type CmsItem = Record<string, unknown> & { id: string };

const SECTIONS: { key: SectionKey; label: string; fields: string[]; imageField?: string }[] = [
  { key: "donors", label: "Donors", fields: ["name", "url", "tier"], imageField: "imageAssetId" },
  { key: "projects", label: "Projects", fields: ["title", "season", "summary", "externalUrl"] },
  { key: "events", label: "Events", fields: ["title", "kind", "location", "date"] },
  {
    key: "members",
    label: "Public members",
    fields: ["name", "role", "classYear", "orgMemberUid"],
    imageField: "imageAssetId",
  },
  { key: "social", label: "Social links", fields: ["label", "url"] },
];

export default function OrgPublicCmsPage() {
  const { orgId, org, canManage, refresh, setError } = useOrgWorkspace();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [announcementHref, setAnnouncementHref] = useState("");
  const [mission, setMission] = useState("");
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaBody, setCtaBody] = useState("");
  const [ctaJoin, setCtaJoin] = useState("");
  const [ctaDonate, setCtaDonate] = useState("");
  const [visibility, setVisibility] = useState<"public" | "hidden">("hidden");
  const [sections, setSections] = useState<Record<SectionKey, CmsItem[]>>({
    donors: [],
    projects: [],
    events: [],
    members: [],
    social: [],
  });
  const [drafts, setDrafts] = useState<Partial<Record<SectionKey, Record<string, string>>>>({});
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<{ section: SectionKey; id: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void cloudApi
      .getOrgPublicCms(orgId)
      .then((data) => {
        const o = (data.org || {}) as {
          publicPage?: {
            visibility?: string;
            mission?: string;
            announcement?: { text?: string; href?: string };
            cta?: { title?: string; body?: string; joinUrl?: string; donateUrl?: string };
          };
        };
        const pp = o.publicPage || org?.publicPage;
        setVisibility(pp?.visibility === "public" ? "public" : "hidden");
        setMission(pp?.mission || "");
        setAnnouncement(pp?.announcement?.text || "");
        setAnnouncementHref(pp?.announcement?.href || "");
        setCtaTitle(pp?.cta?.title || "");
        setCtaBody(pp?.cta?.body || "");
        setCtaJoin(pp?.cta?.joinUrl || "");
        setCtaDonate(pp?.cta?.donateUrl || "");
        setSections({
          donors: (data.donors as CmsItem[]) || [],
          projects: (data.projects as CmsItem[]) || [],
          events: (data.events as CmsItem[]) || [],
          members: (data.members as CmsItem[]) || [],
          social: (data.social as CmsItem[]) || [],
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [orgId, org?.publicPage, setError]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  async function savePageMeta() {
    setBusy(true);
    try {
      await cloudApi.patchOrg(orgId, {
        publicPage: {
          visibility,
          mission: mission.trim() || undefined,
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
      showNotification("Public page updated", "success");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      showNotification(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function addItem(section: SectionKey) {
    const draft = drafts[section] || {};
    const body: Record<string, unknown> = { ...draft, order: sections[section].length };
    setBusy(true);
    try {
      await cloudApi.upsertPublicItem(orgId, section, "new", body);
      setDrafts((d) => ({ ...d, [section]: {} }));
      load();
      showNotification("Item added", "success");
    } catch (err) {
      setError((err as Error).message);
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

  const slug = org?.slug?.trim();
  const canView = slug && visibility === "public";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Public page</h2>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Edit the marketing site at{" "}
            {slug ? (
              <code className="text-nb-caption">/o/{slug}</code>
            ) : (
              <span>a public slug (set one in Settings)</span>
            )}
            .
          </p>
        </div>
        {canView ? (
          <a
            href={`/o/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-nb-primary hover:underline"
          >
            View public site <ExternalLink size={14} />
          </a>
        ) : (
          <Link href={`/orgs/${orgId}/settings`} className="text-sm font-semibold text-nb-primary hover:underline">
            {slug ? "Visibility is hidden — Settings" : "Claim a slug in Settings"}
          </Link>
        )}
      </div>

      {!slug && (
        <Alert variant="warning">
          Set a unique public slug under Settings before the public site can be opened.
        </Alert>
      )}

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
          label="Mission"
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="About blurb"
        />
        <TextField label="CTA title" value={ctaTitle} onChange={(e) => setCtaTitle(e.target.value)} />
        <TextField label="CTA body" value={ctaBody} onChange={(e) => setCtaBody(e.target.value)} />
        <TextField label="Join URL" value={ctaJoin} onChange={(e) => setCtaJoin(e.target.value)} />
        <TextField label="Donate URL" value={ctaDonate} onChange={(e) => setCtaDonate(e.target.value)} />
        <Button variant="primary" disabled={busy} onClick={() => void savePageMeta()}>
          {busy ? "Saving…" : "Save home content"}
        </Button>
      </section>

      {SECTIONS.map((sec) => (
        <section key={sec.key} className="flex flex-col gap-3">
          <h3 className="text-nb-body font-semibold text-nb-on-surface">{sec.label}</h3>
          <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
            {sections[sec.key].map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-nb-body">
                <div className="min-w-0 space-y-0.5">
                  {sec.fields.map((f) =>
                    item[f] ? (
                      <p key={f} className="truncate">
                        <span className="text-nb-caption text-nb-on-surface-variant">{f}: </span>
                        {String(item[f])}
                      </p>
                    ) : null
                  )}
                  {sec.imageField && item[sec.imageField] ? (
                    <p className="truncate text-nb-caption text-nb-on-surface-variant">
                      image: {String(item[sec.imageField])}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {sec.imageField && (
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
                  )}
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
            ))}
            {!sections[sec.key].length && (
              <li className="px-4 py-6 text-center text-nb-on-surface-variant text-nb-caption">
                No items yet.
              </li>
            )}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            {sec.fields.map((f) => (
              <TextField
                key={f}
                label={f}
                value={drafts[sec.key]?.[f] || ""}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [sec.key]: { ...(d[sec.key] || {}), [f]: e.target.value },
                  }))
                }
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void addItem(sec.key)}
          >
            <Plus size={14} /> Add {sec.label.replace(/s$/, "").toLowerCase()}
          </Button>
        </section>
      ))}
    </div>
  );
}
