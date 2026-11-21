"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { showNotification } from "@/components/overlays/Notification";
import { Button, Checkbox, Dialog, ImageField, LoadingBlock, TextField } from "@/components/ui";
import {
  cloudApi,
  type OrgCatalogItem,
  type OrgCatalogSection,
} from "@/lib/cloud/api";

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

const SECTION_CONFIG: Record<
  OrgCatalogSection,
  { title: string; singular: string; fields: string[] }
> = {
  donors: { title: "Donors", singular: "donor", fields: ["name", "url", "tier"] },
  projects: {
    title: "Projects",
    singular: "project",
    fields: ["title", "season", "summary", "externalUrl"],
  },
  events: {
    title: "Events",
    singular: "event",
    fields: ["title", "kind", "location", "date"],
  },
  "social-links": {
    title: "Social links",
    singular: "social link",
    fields: ["label", "url"],
  },
};

function primaryLabel(item: OrgCatalogItem, fields: string[]) {
  for (const f of fields) {
    const v = item[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Untitled";
}

export function OrgCatalogManager({
  orgId,
  section,
  canManage,
  setError,
  embedded = false,
}: {
  orgId: string;
  section: OrgCatalogSection;
  canManage: boolean;
  setError: (msg: string | null) => void;
  /** Hide page title when nested (e.g. Settings → Social links). */
  embedded?: boolean;
}) {
  const cfg = SECTION_CONFIG[section];
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<OrgCatalogItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{
    mode: "add" | "edit";
    id?: string;
    values: Record<string, string>;
    isPublic: boolean;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void cloudApi
      .listOrgCatalog(orgId, section)
      .then(async (rows) => {
        setItems(rows);
        const map: Record<string, string> = {};
        await Promise.all(
          rows.map(async (item) => {
            if (!item.imageAssetId) return;
            try {
              const { url } = await cloudApi.getOrgAssetUrl(orgId, item.imageAssetId);
              map[item.imageAssetId] = url;
            } catch {
              /* ignore */
            }
          })
        );
        setThumbs(map);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [orgId, section, setError]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  async function saveItem() {
    if (!editor) return;
    const body: Record<string, unknown> = {
      ...editor.values,
      public: editor.isPublic,
    };
    if (editor.mode === "add") body.order = items.length;
    else if (editor.id) {
      const existing = items.find((i) => i.id === editor.id);
      if (existing?.imageAssetId) body.imageAssetId = existing.imageAssetId;
    }
    setBusy(true);
    try {
      await cloudApi.upsertOrgCatalogItem(
        orgId,
        section,
        editor.mode === "add" ? "new" : editor.id || "new",
        body
      );
      setEditor(null);
      load();
      showNotification(editor.mode === "add" ? "Added" : "Saved", "success");
    } catch (err) {
      setError((err as Error).message);
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(item: OrgCatalogItem) {
    setBusy(true);
    try {
      await cloudApi.upsertOrgCatalogItem(orgId, section, item.id, {
        ...item,
        public: item.public === false,
      });
      load();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(itemId: string, file: File) {
    setBusy(true);
    try {
      const { asset } = await cloudApi.createOrgAsset(orgId, {
        contentType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      await cloudApi.uploadOrgAssetContent(orgId, asset.id, file, file.type || "image/jpeg");
      const item = items.find((i) => i.id === itemId);
      await cloudApi.upsertOrgCatalogItem(orgId, section, itemId, {
        ...(item || {}),
        imageAssetId: asset.id,
      });
      load();
      showNotification("Image attached", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearPhoto(itemId: string) {
    setBusy(true);
    try {
      const item = items.find((i) => i.id === itemId);
      await cloudApi.upsertOrgCatalogItem(orgId, section, itemId, {
        ...(item || {}),
        imageAssetId: null,
      });
      load();
      showNotification("Image removed", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-6 text-nb-body text-nb-on-surface-variant">
        Only organization admins and owners can manage {cfg.title.toLowerCase()}.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <LoadingBlock label={`Loading ${cfg.title.toLowerCase()}…`} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded ? (
          <h2 className="text-nb-title font-bold tracking-tight text-nb-on-surface">{cfg.title}</h2>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            setEditor({
              mode: "add",
              values: Object.fromEntries(cfg.fields.map((f) => [f, ""])),
              isPublic: true,
            })
          }
        >
          <Plus size={14} /> Add
        </Button>
      </div>

      <ul className="divide-y divide-nb-outline-variant/20 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
        {items.map((item) => {
          const isPublic = item.public !== false;
          const thumb = item.imageAssetId ? thumbs[item.imageAssetId] : undefined;
          return (
            <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
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
                    {primaryLabel(item, cfg.fields)}
                  </p>
                  {cfg.fields.slice(1).map((f) =>
                    item[f] ? (
                      <p key={f} className="truncate text-nb-caption text-nb-on-surface-variant">
                        {FIELD_LABELS[f] || f}: {String(item[f])}
                      </p>
                    ) : null
                  )}
                  <p className="text-nb-caption text-nb-on-surface-variant">
                    {isPublic ? "Public" : "Hidden from public site"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant={isPublic ? "secondary" : "ghost"}
                  disabled={busy}
                  onClick={() => void togglePublic(item)}
                >
                  {isPublic ? "Public" : "Private"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Edit"
                  onClick={() =>
                    setEditor({
                      mode: "edit",
                      id: item.id,
                      values: Object.fromEntries(
                        cfg.fields.map((f) => [f, item[f] != null ? String(item[f]) : ""])
                      ),
                      isPublic,
                    })
                  }
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-nb-danger"
                  disabled={busy}
                  title="Delete"
                  onClick={() => setDeleteId(item.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </li>
          );
        })}
        {!items.length && (
          <li className="px-4 py-8 text-center text-nb-caption text-nb-on-surface-variant">
            No {cfg.title.toLowerCase()} yet.
          </li>
        )}
      </ul>

      <Dialog
        isOpen={Boolean(editor)}
        onClose={() => !busy && setEditor(null)}
        title={
          editor
            ? editor.mode === "add"
              ? `Add ${cfg.singular}`
              : `Edit ${cfg.singular}`
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
        {editor ? (
          <div className="grid gap-3">
            {cfg.fields.map((f) => (
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
            <Checkbox
              label="Public"
              checked={editor.isPublic}
              onChange={(e) =>
                setEditor((prev) => (prev ? { ...prev, isPublic: e.target.checked } : prev))
              }
            />
            {editor.mode === "edit" && editor.id ? (
              <ImageField
                size="sm"
                previewUrl={
                  items.find((i) => i.id === editor.id)?.imageAssetId
                    ? thumbs[items.find((i) => i.id === editor.id)!.imageAssetId!]
                    : null
                }
                busy={busy}
                onUpload={(file) => void uploadPhoto(editor.id!, file)}
                onRemove={
                  items.find((i) => i.id === editor.id)?.imageAssetId
                    ? () => void clearPhoto(editor.id!)
                    : undefined
                }
                emptyLabel="Image"
              />
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <ConfirmationDialog
        isOpen={Boolean(deleteId)}
        title={`Delete ${cfg.singular}?`}
        message={`Delete “${
          (() => {
            const row = deleteId ? items.find((i) => i.id === deleteId) : undefined;
            return row ? primaryLabel(row, cfg.fields) : cfg.singular;
          })()
        }”? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (!id) return;
          setBusy(true);
          void cloudApi
            .deleteOrgCatalogItem(orgId, section, id)
            .then(load)
            .catch((err) => showNotification((err as Error).message, "error"))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
