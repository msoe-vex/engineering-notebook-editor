"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collabDocName } from "@engineering-notebook/shared";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Alert, Badge, Button, DropdownMenu } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { getIdToken } from "@/lib/cloud/firebase";

export default function EntryPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = String(params.entryId);
  const {
    orgId,
    notebookId,
    entries,
    notebookSummary,
    refresh,
    setError,
    showConfirm,
    showPrompt,
  } = useNotebookWorkspace();
  const meta = entries[entryId];
  const docName = collabDocName(orgId, notebookId, entryId);
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;
  const [titleDraft, setTitleDraft] = useState(meta?.title ?? "");
  const [authorsDraft, setAuthorsDraft] = useState((meta?.authors || []).join(", "));
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    setTitleDraft(meta?.title ?? "");
    setAuthorsDraft((meta?.authors || []).join(", "));
  }, [meta?.title, meta?.authors, entryId]);

  const phases = useMemo(() => {
    const raw = (notebookSummary?.phases || {}) as Record<
      string,
      { name?: string; order?: number }
    >;
    return Object.entries(raw).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  }, [notebookSummary]);

  if (Object.keys(entries).length > 0 && !meta) {
    return (
      <Alert variant="error">
        Entry not found.{" "}
        <Button variant="link" onClick={() => router.push(basePath)}>
          Back to notebook
        </Button>
      </Alert>
    );
  }

  const title = meta?.title ?? "Entry";

  function patchMeta(body: Record<string, unknown>) {
    setSavingMeta(true);
    void cloudApi
      .patchEntry(orgId, notebookId, entryId, body)
      .then(refresh)
      .catch((err) => setError((err as Error).message))
      .finally(() => setSavingMeta(false));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-2">
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-nb-display font-bold tracking-tight text-nb-on-surface outline-none placeholder:text-nb-on-surface-variant/40"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const next = titleDraft.trim();
            if (next && next !== title) patchMeta({ title: next });
          }}
          placeholder="Untitled entry"
        />
        {meta?.isTemplate && <Badge tone="tertiary">Template</Badge>}
        <DropdownMenu
          items={[
            {
              id: "rename",
              label: "Rename",
              onSelect: () =>
                showPrompt("Rename entry", title, (next) => {
                  setTitleDraft(next);
                  patchMeta({ title: next });
                }),
            },
            {
              id: "template",
              label: meta?.isTemplate ? "Unset template" : "Mark as template",
              onSelect: () => patchMeta({ isTemplate: !meta?.isTemplate }),
            },
            {
              id: "delete",
              label: "Delete",
              danger: true,
              onSelect: () =>
                showConfirm(
                  "Delete entry?",
                  `Delete "${title}"? This cannot be undone.`,
                  () => {
                    void cloudApi
                      .deleteEntry(orgId, notebookId, entryId)
                      .then(() => {
                        refresh();
                        router.push(basePath);
                      })
                      .catch((err) => setError((err as Error).message));
                  },
                  "danger"
                ),
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-nb-xl border border-nb-outline-variant/20 bg-nb-surface-low/50 px-3 py-2">
        <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
          Date
          <input
            type="date"
            className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-nb-label text-nb-on-surface"
            value={meta?.date || ""}
            disabled={savingMeta}
            onChange={(e) => patchMeta({ date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
          Phase
          <select
            className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-nb-label text-nb-on-surface"
            value={meta?.phase || ""}
            disabled={savingMeta}
            onChange={(e) => patchMeta({ phase: e.target.value || null })}
          >
            <option value="">None</option>
            {phases.map(([id, p]) => (
              <option key={id} value={id}>
                {p.name || id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
          Authors
          <input
            className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-nb-label text-nb-on-surface"
            value={authorsDraft}
            disabled={savingMeta}
            placeholder="Comma-separated"
            onChange={(e) => setAuthorsDraft(e.target.value)}
            onBlur={() => {
              const authors = authorsDraft
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              patchMeta({ authors });
            }}
          />
        </label>
      </div>

      <CollaborativeEntryEditor
        key={entryId}
        documentName={docName}
        entryTitle={title}
        entryId={entryId}
        getToken={getIdToken}
      />
    </div>
  );
}
