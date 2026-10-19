"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import {
  collabDocName,
  mergeMetadataValidationErrors,
  validateEntryMetadataFields,
} from "@engineering-notebook/shared";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";
import { PhasePicker } from "@/components/cloud/PhasePicker";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import AuthorsInput from "@/components/editor/ui/AuthorsInput";
import GenerateButton from "@/components/editor/ui/GenerateButton";
import ViewToggle, { type ViewMode } from "@/components/editor/ui/ViewToggle";
import {
  Badge,
  Button,
  DropdownMenu,
  EmptyState,
  LoadingBlock,
  ValidationIssuesTooltip,
} from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import { patchEditorChrome } from "@/lib/cloud/editorChromeStore";
import { formatCloudError } from "@/lib/cloud/errors";
import { getIdToken } from "@/lib/cloud/firebase";
import { generateEntryTitle } from "@/lib/genai";
import { generateEntryLatex, latexPhaseRef } from "@/lib/latex/latex";
import {
  buildResourceTypeIndex,
  extractResources,
  readDefaultAuthors,
  type ProjectPhase,
  type TipTapNode,
} from "@/lib/notebook/metadata";
import { ChevronDown, PanelLeft } from "lucide-react";

const LatexPreview = dynamic(() => import("@/components/editor/LatexPreview"), {
  ssr: false,
  loading: () => (
    <p className="py-8 text-center text-nb-caption text-nb-on-surface-variant">Loading preview…</p>
  ),
});

type SaveState = "idle" | "saving" | "saved" | "error";

export default function EntryPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = String(params.entryId);
  const {
    orgId,
    notebookId,
    entries,
    notebookSummary,
    isArchived,
    initialLoaded,
    notebookUnavailable,
    refresh,
    setEntries,
    setError,
    showConfirm,
    showPrompt,
    isNarrowViewport,
    openMobileExplorer,
  } = useNotebookWorkspace();
  const meta = entries[entryId];
  const docName = collabDocName(orgId, notebookId, entryId);
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;
  const [titleDraft, setTitleDraft] = useState(meta?.title ?? "");
  const [authorsDraft, setAuthorsDraft] = useState<string[]>(meta?.authors || []);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [metaOpen, setMetaOpen] = useState(true);
  const [docJson, setDocJson] = useState<TipTapNode | null>(null);
  const narrow = Boolean(isNarrowViewport);
  const effectiveViewMode: ViewMode =
    narrow && viewMode === "split" ? "editor" : viewMode;
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const authorsFieldRef = useRef<HTMLDivElement>(null);
  /** entryId we've hydrated drafts for once meta was available (full reload races empty meta). */
  const hydratedEntryIdRef = useRef<string | null>(meta ? entryId : null);
  /** Track entry switches during render so header meta paints immediately (no blank flash). */
  const [draftEntryId, setDraftEntryId] = useState(entryId);
  if (draftEntryId !== entryId) {
    setDraftEntryId(entryId);
    setTitleDraft(meta?.title ?? "");
    setAuthorsDraft(meta?.authors || []);
    hydratedEntryIdRef.current = meta ? entryId : null;
    setDocJson(null);
    setSaveState("idle");
    setMetaOpen(!narrow);
  }

  useEffect(() => {
    patchEditorChrome({ saveState: "idle" });
  }, [entryId]);

  // Keep header drafts in sync with SSE/meta unless the user is actively editing that field.
  useEffect(() => {
    if (!meta || saveState === "saving") return;
    const serverTitle = meta.title ?? "";
    const serverAuthors = meta.authors || [];

    if (hydratedEntryIdRef.current !== entryId) {
      hydratedEntryIdRef.current = entryId;
      setTitleDraft(serverTitle);
      setAuthorsDraft(serverAuthors);
      return;
    }

    const titleFocused =
      !!titleInputRef.current && document.activeElement === titleInputRef.current;
    const authorsFocused =
      !!authorsFieldRef.current &&
      authorsFieldRef.current.contains(document.activeElement);

    if (!titleFocused) setTitleDraft(serverTitle);
    if (!authorsFocused) setAuthorsDraft(serverAuthors);
  }, [entryId, meta, meta?.title, meta?.authors, saveState]);

  useEffect(() => {
    patchEditorChrome({ saveState });
  }, [saveState]);

  useEffect(() => {
    const fromEntries = new Set<string>();
    for (const e of Object.values(entries)) {
      for (const a of e.authors || []) fromEntries.add(a);
    }
    for (const a of readDefaultAuthors()) fromEntries.add(a);
    setAuthorOptions([...fromEntries].sort((a, b) => a.localeCompare(b)));
  }, [entries]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      patchEditorChrome({ saveState: null });
    };
  }, []);

  const phasesRecord = (notebookSummary?.phases || {}) as Record<string, ProjectPhase>;

  const phases = useMemo(() => {
    return Object.entries(phasesRecord).sort(
      (a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)
    );
  }, [phasesRecord]);

  const applyOptimistic = useCallback(
    (body: Record<string, unknown>) => {
      if (!setEntries) return;
      setEntries((prev) => {
        const cur = prev[entryId];
        if (!cur) return prev;
        const next = { ...cur };
        if (body.title !== undefined) next.title = String(body.title);
        if (body.date !== undefined) next.date = String(body.date ?? "");
        if (body.phase !== undefined) next.phase = (body.phase as string | null) ?? null;
        if (body.authors !== undefined) next.authors = body.authors as string[];
        if (body.isTemplate !== undefined) next.isTemplate = Boolean(body.isTemplate);
        const metaErrors = validateEntryMetadataFields(next, phasesRecord);
        const { validationErrors, isValid } = mergeMetadataValidationErrors(
          next.validationErrors,
          metaErrors
        );
        next.validationErrors = validationErrors;
        next.isValid = isValid;
        return { ...prev, [entryId]: next };
      });
    },
    [entryId, phasesRecord, setEntries]
  );

  const patchMeta = useCallback(
    (body: Record<string, unknown>) => {
      applyOptimistic(body);
      setSaveState("saving");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      void cloudApi
        .patchEntry(orgId, notebookId, entryId, body)
        .then((res) => {
          const saved = res as {
            title?: string;
            authors?: string[];
            isValid?: boolean;
            validationErrors?: string[];
          };
          if (setEntries && (saved.isValid !== undefined || saved.validationErrors)) {
            setEntries((prev) => {
              const cur = prev[entryId];
              if (!cur) return prev;
              return {
                ...prev,
                [entryId]: {
                  ...cur,
                  ...(typeof saved.title === "string" ? { title: saved.title } : {}),
                  ...(Array.isArray(saved.authors) ? { authors: saved.authors } : {}),
                  isValid: saved.isValid ?? cur.isValid,
                  validationErrors: saved.validationErrors ?? cur.validationErrors,
                },
              };
            });
          }
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
        })
        .catch((err) => {
          setSaveState("error");
          setError(formatCloudError(err, "Could not save entry"));
          refresh();
        });
    },
    [applyOptimistic, entryId, notebookId, orgId, refresh, setEntries, setError]
  );

  const liveLatex = useMemo(() => {
    if (!meta || !docJson) return "";
    try {
      const entryMap = Object.fromEntries(
        Object.entries(entries).map(([id, e]) => [
          id,
          {
            title: e.title || "",
            authors: e.authors || [],
            phase: e.phase,
            createdAt: e.createdAt || "",
            updatedAt: e.updatedAt || "",
            date: e.date || "",
            filename: id,
            order: e.order ?? 0,
            isTemplate: e.isTemplate,
            assets: [],
          },
        ])
      );
      const resources = extractResources(docJson);
      const resourceTypes = buildResourceTypeIndex(entryMap, resources, entryId);
      return generateEntryLatex(
        docJson,
        titleDraft || meta.title || "Untitled",
        authorsDraft,
        latexPhaseRef(meta.phase, phasesRecord),
        meta.createdAt,
        entryId,
        resourceTypes,
        meta.date
      );
    } catch {
      return "";
    }
  }, [
    authorsDraft,
    docJson,
    entries,
    entryId,
    meta,
    phasesRecord,
    titleDraft,
  ]);

  useEffect(() => {
    if (narrow && viewMode === "split") setViewMode("editor");
  }, [narrow, viewMode]);

  // One PanelGroup for all view modes so CollaborativeEntryEditor stays mounted
  // (LaTeX-only used to unmount it and drop the collab WebSocket).
  useEffect(() => {
    const editorPanel = editorPanelRef.current;
    const previewPanel = previewPanelRef.current;
    if (!editorPanel || !previewPanel) return;
    if (effectiveViewMode === "editor") {
      previewPanel.collapse();
      editorPanel.expand();
      editorPanel.resize(100);
    } else if (effectiveViewMode === "preview") {
      editorPanel.collapse();
      previewPanel.expand();
      previewPanel.resize(100);
    } else {
      editorPanel.expand();
      previewPanel.expand();
      editorPanel.resize(50);
      previewPanel.resize(50);
    }
  }, [effectiveViewMode]);

  if (notebookUnavailable) {
    return null;
  }

  if (!initialLoaded) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <LoadingBlock label="Loading entry…" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          className="max-w-md"
          title="Entry not found"
          description="This entry isn’t in the notebook. It may have been deleted, or the link is from another environment."
          action={
            <Button size="sm" variant="primary" onClick={() => router.push(basePath)}>
              Back to notebook
            </Button>
          }
        />
      </div>
    );
  }

  if (meta.deletedAt) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          className="max-w-md"
          title="This entry is in Trash"
          description={`“${meta.title || "Untitled"}” was moved to Trash. Restore it to keep editing, or delete it forever from Trash.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  void cloudApi
                    .restoreEntry(orgId, notebookId, entryId)
                    .then(() => {
                      refresh();
                      showNotification("Entry restored", "success");
                    })
                    .catch((err) => setError(formatCloudError(err)));
                }}
              >
                Restore
              </Button>
              <Button size="sm" variant="secondary" onClick={() => router.push(`${basePath}/trash`)}>
                Open Trash
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const title = meta.title;
  const savingMeta = saveState === "saving";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface/95 px-4 py-2 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {narrow && openMobileExplorer && (
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-nb-lg text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface md:hidden"
              aria-label="Open entry list"
              onClick={() => openMobileExplorer()}
            >
              <PanelLeft size={18} />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={titleInputRef}
              className={`min-w-0 flex-1 border-0 bg-transparent text-xl font-bold tracking-tight text-nb-on-surface outline-none placeholder:text-nb-on-surface-variant/40 md:text-2xl ${
                isArchived ? "cursor-default select-text" : ""
              }`}
              value={titleDraft}
              disabled={isArchived}
              onChange={(e) => {
                const next = e.target.value;
                setTitleDraft(next);
                if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                titleTimerRef.current = setTimeout(() => {
                  const trimmed = next.trim();
                  if (trimmed && trimmed !== (meta?.title ?? "")) {
                    patchMeta({ title: trimmed });
                  }
                }, 550);
              }}
              onBlur={() => {
                if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                const next = titleDraft.trim();
                if (next && next !== title) patchMeta({ title: next });
              }}
              placeholder="Untitled entry"
            />
            {!isArchived && (
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
            )}
          </div>
          {meta?.isTemplate && <Badge tone="tertiary">Template</Badge>}
          {meta?.isValid === false && (meta.validationErrors?.length ?? 0) > 0 && (
            <ValidationIssuesTooltip
              errors={meta.validationErrors!}
              onClick={() => setMetaOpen(true)}
            />
          )}
          <ViewToggle
            viewMode={effectiveViewMode}
            onSetViewMode={setViewMode}
            isMobile={narrow}
          />
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-nb-lg text-nb-on-surface-variant transition-transform hover:bg-nb-surface-low hover:text-nb-on-surface ${
              metaOpen ? "rotate-180" : ""
            }`}
            aria-expanded={metaOpen}
            aria-label={metaOpen ? "Hide entry details" : "Show entry details"}
            title={metaOpen ? "Hide details" : "Date, phase & authors"}
            onClick={() => setMetaOpen((v) => !v)}
          >
            <ChevronDown size={16} />
          </button>
          {!isArchived && (
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
          )}
        </div>

        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out ${
            metaOpen
              ? "mt-2 max-h-[40rem] opacity-100"
              : "pointer-events-none mt-0 max-h-0 opacity-0"
          }`}
        >
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-[10rem_12rem_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
              Date
              <input
                type="date"
                className="h-9 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 text-nb-label text-nb-on-surface disabled:opacity-60 disabled:cursor-not-allowed"
                value={meta?.date || ""}
                disabled={savingMeta || isArchived}
                onChange={(e) => patchMeta({ date: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
              Phase
              <PhasePicker
                phaseId={meta?.phase}
                phases={phasesRecord}
                disabled={savingMeta || isArchived}
                onChange={(phase) => patchMeta({ phase })}
              />
            </label>
            <div
              ref={authorsFieldRef}
              className="flex min-w-0 flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant sm:col-span-2 xl:col-span-1"
            >
              Authors
              <AuthorsInput
                authors={authorsDraft}
                options={authorOptions}
                placeholder="Add authors"
                className="min-h-9 bg-nb-surface"
                disabled={savingMeta || isArchived}
                onChange={(authors) => {
                  setAuthorsDraft(authors);
                  patchMeta({ authors });
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/*
        Absolute-fill scroll panes: flex-1 alone fails inside react-resizable-panels
        (Panel is not a flex column). overflow-y-auto class required for RichTextArea.
        Always mount CollaborativeEntryEditor (collapse its panel in LaTeX-only) so
        Hocuspocus stays connected and liveLatex keeps updating from onDocChange.
      */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PanelGroup
          direction="horizontal"
          className="absolute inset-0"
          id="entry-editor-preview"
        >
          <Panel
            id="entry-editor-panel"
            ref={editorPanelRef}
            order={1}
            defaultSize={effectiveViewMode === "preview" ? 0 : effectiveViewMode === "split" ? 50 : 100}
            minSize={effectiveViewMode === "split" ? 20 : 0}
            collapsible
            collapsedSize={0}
            className="min-h-0 min-w-0"
          >
            <div className="h-full min-h-0 overflow-hidden">
              <CollaborativeEntryEditor
                key={entryId}
                documentName={docName}
                entryId={entryId}
                getToken={getIdToken}
                onDocChange={setDocJson}
              />
            </div>
          </Panel>
          <PanelResizeHandle
            className={
              effectiveViewMode === "split"
                ? "mx-1 w-1.5 shrink-0 rounded-full bg-nb-outline-variant/25 transition-colors hover:bg-nb-primary/40 data-[resize-handle-active]:bg-nb-primary/50"
                : "pointer-events-none w-0 overflow-hidden opacity-0"
            }
            title={
              effectiveViewMode === "split"
                ? "Drag to resize · double-click to reset"
                : undefined
            }
            onDoubleClick={() => {
              if (effectiveViewMode !== "split") return;
              editorPanelRef.current?.resize(50);
              previewPanelRef.current?.resize(50);
            }}
          />
          <Panel
            id="entry-preview-panel"
            ref={previewPanelRef}
            order={2}
            defaultSize={effectiveViewMode === "editor" ? 0 : effectiveViewMode === "split" ? 50 : 100}
            minSize={effectiveViewMode === "split" ? 20 : 0}
            collapsible
            collapsedSize={0}
            className="min-h-0 min-w-0"
          >
            <div
              className={
                effectiveViewMode === "split"
                  ? "h-full min-h-0 overflow-y-auto custom-scrollbar border-l border-nb-outline-variant/20"
                  : "h-full min-h-0 overflow-y-auto custom-scrollbar"
              }
            >
              {liveLatex ? (
                <LatexPreview latexContent={liveLatex} />
              ) : (
                <p className="py-8 text-center text-nb-caption text-nb-on-surface-variant">
                  {docJson ? "Generating LaTeX…" : "Connecting to editor…"}
                </p>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
