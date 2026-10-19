"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Gavel, LayoutGrid, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { JudgeHomeView } from "@/components/cloud/judge/JudgeHomeView";
import {
  pathForJudgeSelection,
  selectionFromJudgePath,
  type JudgeSelection,
} from "@/components/cloud/judge/judgeRoutes";
import { JudgmentResultView } from "@/components/cloud/judge/JudgmentResultView";
import { RubricEditorDialog } from "@/components/cloud/judge/RubricEditorDialog";
import { RubricMatrixTable } from "@/components/cloud/judge/RubricMatrixTable";
import { resolveJudgeInferenceBody } from "@/components/cloud/judge/resolveJudgeInference";
import { RubricsGridView } from "@/components/cloud/judge/RubricsGridView";
import { showNotification } from "@/components/overlays/Notification";
import { Alert, Button, ContextMenu, IconButton } from "@/components/ui";
import type { MenuItem } from "@/components/ui/menuTypes";
import {
  cloudApi,
  type JudgmentRecord,
  type RubricRecord,
} from "@/lib/cloud/api";
import { subscribeNotebookEvents } from "@/lib/cloud/notebookEvents";
import toast from "react-hot-toast";

type CtxState = { x: number; y: number; items: MenuItem[] } | null;

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CloudNotebookJudge() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { orgId, notebookId, setError, isArchived } = useNotebookWorkspace();
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;
  const selection = useMemo(
    () => selectionFromJudgePath(pathname, basePath),
    [pathname, basePath]
  );
  const navigate = useCallback(
    (next: JudgeSelection) => {
      const href = pathForJudgeSelection(basePath, next);
      if (href !== pathname) router.push(href);
    },
    [basePath, pathname, router]
  );
  const [rubrics, setRubrics] = useState<RubricRecord[]>([]);
  const [grades, setGrades] = useState<JudgmentRecord[]>([]);
  const [listsReady, setListsReady] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRubric, setEditingRubric] = useState<RubricRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [ctx, setCtx] = useState<CtxState>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "trash-rubric"; id: string; name: string }
    | { kind: "delete-grade"; id: string; name: string }
    | { kind: "clear-grades" }
    | null
  >(null);
  const jobIdRef = useRef<string | null>(null);
  const extractJobRef = useRef<{
    jobId: string;
    rubricId: string;
    name: string;
    toastId: string;
  } | null>(null);

  const refreshLists = useCallback(async () => {
    const [r, j] = await Promise.all([
      cloudApi.listRubrics(orgId, notebookId),
      cloudApi.listJudgments(orgId, notebookId),
    ]);
    setRubrics(r);
    setGrades(j);
    setListsReady(true);
    return { r, j };
  }, [orgId, notebookId]);

  useEffect(() => {
    setListsReady(false);
    void refreshLists().catch((err) => setError((err as Error).message));
  }, [orgId, notebookId, refreshLists, setError]);

  useEffect(() => {
    const ac = new AbortController();
    subscribeNotebookEvents(
      orgId,
      notebookId,
      (event) => {
        const pending = extractJobRef.current;
        if (!pending) return;
        if (event.type === "job.progress") {
          return;
        }
        if (event.type === "job.done") {
          if (event.jobId !== pending.jobId) return;
          extractJobRef.current = null;
          toast.dismiss(pending.toastId);
          const rubricId =
            (typeof event.result?.rubricId === "string" && event.result.rubricId) ||
            pending.rubricId;
          void refreshLists().then(() => {
            navigate({ kind: "rubric", id: rubricId });
            showNotification(`Rubric “${pending.name}” is ready`, "success");
          });
          return;
        }
        if (event.type === "job.failed") {
          if (event.jobId !== pending.jobId) return;
          extractJobRef.current = null;
          toast.dismiss(pending.toastId);
          showNotification(event.error || "Rubric extract failed", "error");
          void refreshLists();
        }
      },
      ac.signal
    );
    return () => ac.abort();
  }, [orgId, notebookId, refreshLists, navigate]);

  function onExtractStarted(info: { jobId: string; rubricId: string; name: string }) {
    const toastId = showNotification(`Extracting “${info.name}”…`, "loading") as string;
    extractJobRef.current = { ...info, toastId };
  }

  const selectedRubric = useMemo(() => {
    if (selection.kind === "rubric") {
      return rubrics.find((r) => r.id === selection.id) || null;
    }
    // When viewing a grade, resolve its rubric for Run judge — but do not treat as sidebar selection.
    if (selection.kind === "grade") {
      const g = grades.find((x) => x.id === selection.id);
      if (g?.rubricId) return rubrics.find((r) => r.id === g.rubricId) || null;
    }
    return null;
  }, [selection, rubrics, grades]);

  const selectedGrade = useMemo(() => {
    if (selection.kind !== "grade") return null;
    return grades.find((j) => j.id === selection.id) || null;
  }, [selection, grades]);

  // If a deep-linked rubric/grade disappeared, fall back to its overview.
  useEffect(() => {
    if (!listsReady) return;
    if (selection.kind === "rubric" && !selectedRubric) {
      navigate({ kind: "home-rubrics" });
    }
    if (selection.kind === "grade" && !selectedGrade) {
      navigate({ kind: "home-grades" });
    }
  }, [listsReady, selection, selectedRubric, selectedGrade, navigate]);

  const readyRubric =
    selectedRubric?.status === "ready" && selectedRubric.matrix?.categories?.length
      ? selectedRubric
      : null;

  async function waitForScoreJob(jobId: string, judgmentId: string) {
    jobIdRef.current = jobId;
    setStatus("Queued…");
    setProgress(5);

    await new Promise<void>((resolve, reject) => {
      const ac = new AbortController();
      const timeout = setTimeout(
        () => {
          ac.abort();
          reject(new Error("Judge timed out (15 minutes)."));
        },
        15 * 60 * 1000
      );

      const finish = (err?: Error) => {
        clearTimeout(timeout);
        clearInterval(poll);
        ac.abort();
        if (err) reject(err);
        else resolve();
      };

      subscribeNotebookEvents(
        orgId,
        notebookId,
        (event) => {
          if (event.type === "job.progress") {
            if (event.jobType && event.jobType !== "judge") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            setStatus(event.status || "Working…");
            setProgress(event.progress ?? 0);
            return;
          }
          if (event.type === "job.done") {
            if (event.jobType && event.jobType !== "judge") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            finish();
            return;
          }
          if (event.type === "job.failed") {
            if (event.jobType && event.jobType !== "judge") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            finish(new Error(event.error || "Judge failed"));
          }
        },
        ac.signal
      );

      const poll = setInterval(() => {
        void cloudApi
          .getJudgment(orgId, notebookId, judgmentId)
          .then((j) => {
            if (j.status === "completed") finish();
            else if (j.status === "failed") finish(new Error(j.error || "Judge failed"));
          })
          .catch(() => undefined);
      }, 4000);
    });

    const judgment = await cloudApi.getJudgment(orgId, notebookId, judgmentId);
    await refreshLists();
    navigate({ kind: "grade", id: judgment.id });
  }

  async function runJudge(rubricIdOverride?: string) {
    if (isArchived) return;
    const target =
      (rubricIdOverride && rubrics.find((r) => r.id === rubricIdOverride)) ||
      readyRubric ||
      selectedRubric;
    const rubricId = target?.id;
    if (!rubricId || busy) return;
    if (target?.status !== "ready" || !target.matrix?.categories?.length) {
      setError("Open the rubric editor and extract or finish the matrix before judging.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const inference = await resolveJudgeInferenceBody();
      const { jobId, judgmentId } = await cloudApi.startJudge(orgId, notebookId, {
        rubricId,
        ...inference,
      });
      await waitForScoreJob(jobId, judgmentId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
      setProgress(0);
      jobIdRef.current = null;
    }
  }

  function openNewRubric() {
    if (isArchived) return;
    setEditingRubric(null);
    setEditorOpen(true);
  }

  function openEditRubric(r: RubricRecord) {
    if (isArchived) return;
    setEditingRubric(r);
    setEditorOpen(true);
  }

  function trashRubric(id: string) {
    if (isArchived) return;
    setBusy(true);
    void cloudApi
      .trashRubric(orgId, notebookId, id)
      .then(async () => {
        await refreshLists();
        if (selection.kind === "rubric" && selection.id === id) {
          navigate({ kind: "home-rubrics" });
        }
        showNotification("Rubric moved to Trash", "success", {
          action: {
            label: "View Trash",
            onClick: () => router.push(`${basePath}/trash`),
          },
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function deleteGrade(id: string) {
    if (isArchived) return;
    setBusy(true);
    void cloudApi
      .deleteJudgment(orgId, notebookId, id)
      .then(async () => {
        await refreshLists();
        if (selection.kind === "grade" && selection.id === id) {
          navigate({ kind: "home-grades" });
        }
        showNotification("Grade deleted", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function clearAllGrades() {
    if (isArchived) return;
    setBusy(true);
    void cloudApi
      .clearJudgments(orgId, notebookId)
      .then(async () => {
        await refreshLists();
        if (selection.kind === "grade") navigate({ kind: "home-grades" });
        showNotification("Past grades cleared", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function rubricMenuItems(r: RubricRecord): MenuItem[] {
    if (isArchived) {
      return [
        {
          id: "open",
          label: "Open",
          onSelect: () => navigate({ kind: "rubric", id: r.id }),
        },
      ];
    }
    return [
      {
        id: "open",
        label: "Open",
        onSelect: () => navigate({ kind: "rubric", id: r.id }),
      },
      {
        id: "edit",
        label: "Edit",
        icon: <Pencil size={12} />,
        onSelect: () => openEditRubric(r),
      },
      {
        id: "run",
        label: "Run judge",
        icon: <Play size={12} />,
        disabled: r.status !== "ready" || !r.matrix?.categories?.length || busy,
        onSelect: () => {
          navigate({ kind: "rubric", id: r.id });
          void runJudge(r.id);
        },
      },
      { id: "sep", separator: true },
      {
        id: "trash",
        label: "Move to Trash",
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () =>
          setConfirm({ kind: "trash-rubric", id: r.id, name: r.name || "Rubric" }),
      },
    ];
  }

  function gradeMenuItems(g: JudgmentRecord): MenuItem[] {
    if (isArchived) {
      return [
        {
          id: "open",
          label: "Open grade",
          onSelect: () => navigate({ kind: "grade", id: g.id }),
        },
      ];
    }
    return [
      {
        id: "open",
        label: "Open grade",
        onSelect: () => navigate({ kind: "grade", id: g.id }),
      },
      { id: "sep", separator: true },
      {
        id: "delete",
        label: "Delete grade",
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () =>
          setConfirm({
            kind: "delete-grade",
            id: g.id,
            name: g.rubricName || "Grade",
          }),
      },
    ];
  }

  function onRubricContextMenu(e: ReactMouseEvent, r: RubricRecord) {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items: rubricMenuItems(r) });
  }

  function onGradeContextMenu(e: ReactMouseEvent, g: JudgmentRecord) {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items: gradeMenuItems(g) });
  }

  function onGradesHeaderContextMenu(e: ReactMouseEvent) {
    if (isArchived) return;
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: "clear",
          label: "Clear all past grades",
          icon: <Trash2 size={12} />,
          danger: true,
          disabled: grades.length === 0 || busy,
          onSelect: () => setConfirm({ kind: "clear-grades" }),
        },
      ],
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-nb-surface">
      <header className="shrink-0 border-b border-nb-outline-variant/25 px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Judge</h1>
          {isArchived && (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              (Read-only)
            </span>
          )}
        </div>
        <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
          {isArchived
            ? "Rubrics and past grades are read-only while this notebook is archived."
            : "Manage rubrics, then score the notebook — extract and judge are separate steps"}
        </p>
      </header>

      {busy && (
        <div className="shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface-low px-4 py-2">
          <div className="mb-1.5 flex justify-between text-nb-caption font-semibold text-nb-on-surface-variant">
            <span className="truncate pr-3">{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-nb-surface">
            <div
              className="h-full bg-nb-primary transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-b border-nb-outline-variant/30 bg-nb-surface-low md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="flex items-center gap-0.5 border-b border-nb-outline-variant/20 px-1.5 py-1.5">
            <button
              type="button"
              title="View all rubrics"
              aria-pressed={selection.kind === "home-rubrics"}
              onClick={() => navigate({ kind: "home-rubrics" })}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-nb-md px-1.5 py-1 text-left transition-colors ${
                selection.kind === "home-rubrics"
                  ? "bg-nb-primary/15 text-nb-primary"
                  : "text-nb-on-surface hover:bg-nb-surface/80"
              }`}
            >
              <LayoutGrid size={14} className="shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate text-nb-label font-semibold">
                Rubrics
              </span>
              <ChevronRight
                size={14}
                className={`shrink-0 opacity-50 ${
                  selection.kind === "home-rubrics" ? "opacity-80" : ""
                }`}
              />
            </button>
            {!isArchived && (
              <IconButton
                aria-label="New rubric"
                title="New rubric"
                disabled={busy}
                onClick={openNewRubric}
              >
                <Plus size={16} />
              </IconButton>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
            {rubrics.length === 0 ? (
              <p className="px-1.5 py-2 text-nb-caption text-nb-on-surface-variant">
                No rubrics yet. Create one to extract a PDF or build a custom matrix.
              </p>
            ) : (
              <ul className="mb-2 flex flex-col gap-0.5">
                {rubrics.map((r) => {
                  const active = selection.kind === "rubric" && selection.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "rubric", id: r.id })}
                        onContextMenu={(e) => onRubricContextMenu(e, r)}
                        className={`group flex w-full flex-col rounded px-2 py-1 text-left text-nb-label transition-colors select-none outline-none ${
                          active
                            ? "bg-nb-primary/15 font-medium text-nb-primary"
                            : "text-nb-on-surface hover:bg-nb-surface/80"
                        }`}
                      >
                        <span className="truncate text-xs leading-none">
                          {r.name || r.id}
                        </span>
                        {r.matrix ? (
                          <span
                            className={`mt-0.5 truncate text-[10px] leading-tight ${
                              active
                                ? "text-nb-primary/80"
                                : "text-nb-on-surface-variant/70"
                            }`}
                          >
                            {r.matrix.categories.length} criteria · {r.matrix.totalMaxPoints}{" "}
                            pts
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div
              className="mt-1 flex items-center gap-0.5 border-t border-nb-outline-variant/20 px-0.5 pt-2 pb-1"
              onContextMenu={onGradesHeaderContextMenu}
            >
              <button
                type="button"
                title="View recent scores"
                aria-pressed={selection.kind === "home-grades"}
                onClick={() => navigate({ kind: "home-grades" })}
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-nb-md px-1.5 py-1 text-left transition-colors ${
                  selection.kind === "home-grades"
                    ? "bg-nb-primary/15 text-nb-primary"
                    : "text-nb-on-surface hover:bg-nb-surface/80"
                }`}
              >
                <Gavel size={14} className="shrink-0 opacity-80" />
                <span className="min-w-0 flex-1 truncate text-nb-label font-semibold">
                  Past grades
                </span>
                <ChevronRight
                  size={14}
                  className={`shrink-0 opacity-50 ${
                    selection.kind === "home-grades" ? "opacity-80" : ""
                  }`}
                />
              </button>
              {grades.length > 0 && !isArchived && (
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium text-nb-on-surface-variant hover:bg-nb-surface/80 hover:text-nb-error"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "clear-grades" })}
                >
                  Clear
                </button>
              )}
            </div>
            {grades.length === 0 ? (
              <p className="px-1.5 py-1 text-nb-caption text-nb-on-surface-variant">
                No grades yet. Select a ready rubric and run judge.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {grades.map((g) => {
                  const active = selection.kind === "grade" && selection.id === g.id;
                  const score =
                    g.status === "completed"
                      ? `${g.totalPoints ?? 0}/${g.totalMaxPoints ?? 0}`
                      : g.status || "…";
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "grade", id: g.id })}
                        onContextMenu={(e) => onGradeContextMenu(e, g)}
                        className={`group flex w-full flex-col rounded px-2 py-1 text-left text-nb-label transition-colors select-none outline-none ${
                          active
                            ? "bg-nb-primary/15 font-medium text-nb-primary"
                            : "text-nb-on-surface hover:bg-nb-surface/80"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs leading-none">
                            {g.rubricName || "Grade"}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums opacity-80">
                            {score}
                          </span>
                        </span>
                        <span
                          className={`mt-0.5 truncate text-[10px] leading-tight ${
                            active
                              ? "text-nb-primary/80"
                              : "text-nb-on-surface-variant/70"
                          }`}
                        >
                          {formatWhen(g.createdAt)}
                          {g.status === "failed" ? " · Failed" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
          {!listsReady ? (
            <p className="text-nb-caption text-nb-on-surface-variant">Loading…</p>
          ) : selection.kind === "grade" && selectedGrade ? (
            selectedGrade.status === "completed" ? (
              <JudgmentResultView judgment={selectedGrade} basePath={basePath} />
            ) : selectedGrade.status === "failed" ? (
              <Alert variant="error">{selectedGrade.error || "Judge failed"}</Alert>
            ) : (
              <p className="text-nb-caption text-nb-on-surface-variant">Grade in progress…</p>
            )
          ) : selection.kind === "rubric" && selectedRubric ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-nb-title font-bold text-nb-on-surface">
                    {selectedRubric.name || "Rubric"}
                  </h2>
                  <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                    {selectedRubric.matrix
                      ? `${selectedRubric.matrix.categories.length} criteria · max ${selectedRubric.matrix.totalMaxPoints}`
                      : "Matrix not ready"}
                  </p>
                </div>
                {!isArchived && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => openEditRubric(selectedRubric)}
                    >
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      className="text-nb-error hover:bg-nb-error/10"
                      onClick={() =>
                        setConfirm({
                          kind: "trash-rubric",
                          id: selectedRubric.id,
                          name: selectedRubric.name || "Rubric",
                        })
                      }
                    >
                      <Trash2 size={14} /> Delete
                    </Button>
                    {readyRubric && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runJudge(selectedRubric.id)}
                      >
                        {busy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Play size={14} />
                        )}
                        {busy ? "Judging…" : "Run judge"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {selectedRubric.error && (
                <Alert variant="error">{selectedRubric.error}</Alert>
              )}
              {selectedRubric.matrix?.categories?.length ? (
                <RubricMatrixTable matrix={selectedRubric.matrix} />
              ) : (
                <p className="text-nb-caption text-nb-on-surface-variant">
                  This rubric has no matrix yet. Open Edit / extract to upload a PDF or build
                  criteria manually.
                </p>
              )}
            </div>
          ) : selection.kind === "home-rubrics" ? (
            <RubricsGridView
              rubrics={rubrics}
              onOpenRubric={(id) => navigate({ kind: "rubric", id })}
              onNewRubric={openNewRubric}
              isArchived={isArchived}
            />
          ) : (
            <JudgeHomeView
              grades={grades}
              hasRubrics={rubrics.length > 0}
              basePath={basePath}
              onOpenGrade={(id) => navigate({ kind: "grade", id })}
              onNewRubric={openNewRubric}
              isArchived={isArchived}
            />
          )}
        </main>
      </div>

      <RubricEditorDialog
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        orgId={orgId}
        notebookId={notebookId}
        rubric={editingRubric}
        onExtractStarted={onExtractStarted}
        onSaved={(doc) => {
          setRubrics((prev) => {
            const rest = prev.filter((r) => r.id !== doc.id);
            return [doc, ...rest];
          });
          navigate({ kind: "rubric", id: doc.id });
        }}
      />

      <ContextMenu
        open={Boolean(ctx)}
        x={ctx?.x || 0}
        y={ctx?.y || 0}
        items={ctx?.items || []}
        onClose={() => setCtx(null)}
      />

      <ConfirmationDialog
        isOpen={confirm?.kind === "trash-rubric"}
        title="Move rubric to Trash?"
        message={`Move “${confirm?.kind === "trash-rubric" ? confirm.name : ""}” to Trash? You can restore it later.`}
        confirmLabel="Move to Trash"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const id = confirm?.kind === "trash-rubric" ? confirm.id : null;
          setConfirm(null);
          if (id) trashRubric(id);
        }}
      />

      <ConfirmationDialog
        isOpen={confirm?.kind === "delete-grade"}
        title="Delete grade?"
        message={`Permanently delete the grade for “${
          confirm?.kind === "delete-grade" ? confirm.name : ""
        }”? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const id = confirm?.kind === "delete-grade" ? confirm.id : null;
          setConfirm(null);
          if (id) deleteGrade(id);
        }}
      />

      <ConfirmationDialog
        isOpen={confirm?.kind === "clear-grades"}
        title="Clear all past grades?"
        message={`Permanently delete ${grades.length} ${
          grades.length === 1 ? "grade" : "grades"
        }? This cannot be undone.`}
        confirmLabel="Clear all"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          clearAllGrades();
        }}
      />
    </div>
  );
}
