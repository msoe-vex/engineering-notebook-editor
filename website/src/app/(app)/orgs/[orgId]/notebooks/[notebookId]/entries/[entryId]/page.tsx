"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collabDocName } from "@engineering-notebook/shared";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { PhaseChip } from "@/components/cloud/PhaseChip";
import AuthorsInput from "@/components/editor/ui/AuthorsInput";
import GenerateButton from "@/components/editor/ui/GenerateButton";
import { Alert, Badge, Button, DropdownMenu } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { generateCloudEntryLatex } from "@/lib/cloud/compileCloudNotebook";
import { getIdToken } from "@/lib/cloud/firebase";
import { generateEntryTitle } from "@/lib/genai";
import { readLastAuthors, writeLastAuthors, type ProjectPhase } from "@/lib/notebook/metadata";

const LatexPreview = dynamic(() => import("@/components/editor/LatexPreview"), {
  ssr: false,
  loading: () => (
    <p className="py-8 text-center text-nb-caption text-nb-on-surface-variant">Loading preview…</p>
  ),
});

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
  const [authorsDraft, setAuthorsDraft] = useState<string[]>(meta?.authors || []);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "latex">("edit");
  const [latexPreview, setLatexPreview] = useState("");
  const [latexBusy, setLatexBusy] = useState(false);

  useEffect(() => {
    setTitleDraft(meta?.title ?? "");
    setAuthorsDraft(meta?.authors || []);
  }, [meta?.title, meta?.authors, entryId]);

  useEffect(() => {
    const fromEntries = new Set<string>();
    for (const e of Object.values(entries)) {
      for (const a of e.authors || []) fromEntries.add(a);
    }
    for (const a of readLastAuthors()) fromEntries.add(a);
    setAuthorOptions([...fromEntries].sort((a, b) => a.localeCompare(b)));
  }, [entries]);

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

  async function showLatexPreview() {
    if (!meta) return;
    setViewMode("latex");
    setLatexBusy(true);
    try {
      const { latex } = await generateCloudEntryLatex(
        orgId,
        notebookId,
        entryId,
        meta,
        (notebookSummary?.phases as Record<string, ProjectPhase>) || {},
        entries
      );
      setLatexPreview(latex);
    } catch (err) {
      setError((err as Error).message);
      setViewMode("edit");
    } finally {
      setLatexBusy(false);
    }
  }

  return (
    <div className="-mx-4 flex flex-col gap-0 md:-mx-6">
      <header className="border-b border-nb-outline-variant/20 bg-nb-surface px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
            <GenerateButton
              label="Generate entry title"
              run={async () => {
                let body = "";
                try {
                  const doc = (await cloudApi.getEntryContent(orgId, notebookId, entryId)) as {
                    content?: Array<{ content?: Array<{ text?: string }> }>;
                  };
                  body = JSON.stringify(doc).slice(0, 4000);
                } catch {
                  body = "";
                }
                const phaseName = phases.find(([id]) => id === meta?.phase)?.[1]?.name;
                return generateEntryTitle({
                  title: titleDraft,
                  body,
                  date: meta?.date,
                  authors: authorsDraft,
                  phase: phaseName,
                });
              }}
              onResult={(next) => {
                const t = next.trim();
                if (!t) return;
                setTitleDraft(t);
                patchMeta({ title: t });
              }}
            />
          </div>
          {meta?.isTemplate && <Badge tone="tertiary">Template</Badge>}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === "edit" ? "primary" : "secondary"}
              onClick={() => setViewMode("edit")}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={viewMode === "latex" ? "primary" : "secondary"}
              disabled={latexBusy}
              onClick={() => void showLatexPreview()}
            >
              LaTeX
            </Button>
          </div>
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

        {meta?.isValid === false && (meta.validationErrors?.length ?? 0) > 0 && (
          <Alert variant="warning" className="mt-3">
            <ul className="list-disc pl-4 text-nb-label">
              {meta.validationErrors!.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
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
          <label className="flex min-w-[10rem] flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
            Phase
            <div className="flex items-center gap-2">
              <PhaseChip
                phaseId={meta?.phase}
                phases={(notebookSummary?.phases || null) as Record<string, ProjectPhase> | null}
                size="md"
              />
              <select
                className="min-w-0 flex-1 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-nb-label text-nb-on-surface"
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
            </div>
          </label>
          <div className="flex min-w-[14rem] flex-1 flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
            Authors
            <AuthorsInput
              authors={authorsDraft}
              options={authorOptions}
              placeholder="Add authors"
              className="min-h-10 bg-nb-surface"
              onChange={(authors) => {
                setAuthorsDraft(authors);
                writeLastAuthors(authors);
                patchMeta({ authors });
              }}
            />
          </div>
        </div>
      </header>

      <div className="px-4 py-4 md:px-6">
        {viewMode === "edit" ? (
          <CollaborativeEntryEditor
            key={entryId}
            documentName={docName}
            entryTitle={title}
            entryId={entryId}
            getToken={getIdToken}
          />
        ) : latexBusy ? (
          <p className="py-8 text-center text-nb-caption text-nb-on-surface-variant">
            Generating LaTeX…
          </p>
        ) : (
          <div className="overflow-hidden rounded-nb-xl border border-nb-outline-variant/30">
            <LatexPreview latexContent={latexPreview} />
          </div>
        )}
      </div>
    </div>
  );
}
