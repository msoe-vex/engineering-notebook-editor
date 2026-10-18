"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Pencil, Plus, Upload } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import {
  cloudApi,
  type RubricMatrixPayload,
  type RubricRecord,
} from "@/lib/cloud/api";
import {
  addCriterionToMatrix,
  addLevelColumnToMatrix,
  RubricMatrixEditor,
} from "./RubricMatrixEditor";
import { resolveJudgeInferenceBody } from "./resolveJudgeInference";
import { blankMatrix, cloneMatrix } from "./rubricMatrixUtils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  notebookId: string;
  /** Edit existing; omit for create flow. */
  rubric?: RubricRecord | null;
  onSaved: (rubric: RubricRecord) => void;
  /** Fired when a from-document extract job is started (modal should close). */
  onExtractStarted?: (info: { jobId: string; rubricId: string; name: string }) => void;
};

function nameFromFilename(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
  return base || file.name;
}

type NewMode = "choose" | "manual";

export function RubricEditorDialog({
  isOpen,
  onClose,
  orgId,
  notebookId,
  rubric,
  onSaved,
  onExtractStarted,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [matrix, setMatrix] = useState<RubricMatrixPayload>(blankMatrix());
  const [newMode, setNewMode] = useState<NewMode>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(rubric?.id);
  const showEditor = isEdit || newMode === "manual";

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setBusy(false);
    if (rubric) {
      setNewMode("manual");
      const displayName = rubric.name || rubric.matrix?.title || "";
      setName(displayName);
      const next = rubric.matrix
        ? cloneMatrix(rubric.matrix)
        : blankMatrix(displayName || "Rubric");
      if (displayName) next.title = displayName;
      setMatrix(next);
    } else {
      setNewMode("choose");
      setName("");
      setMatrix(blankMatrix());
    }
  }, [isOpen, rubric]);

  async function onPickDocument(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Always prefer the uploaded filename — ignore any leftover manual name.
      const displayName = nameFromFilename(file);
      const inference = await resolveJudgeInferenceBody();
      const { jobId, rubricId } = await cloudApi.extractRubricFromDocument(
        orgId,
        notebookId,
        file,
        { name: displayName, ...inference }
      );
      onExtractStarted?.({ jobId, rubricId, name: displayName });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const displayName = name.trim() || "Rubric";
      const matrixToSave = { ...matrix, title: displayName };
      if (!isEdit) {
        const doc = await cloudApi.createCustomRubric(orgId, notebookId, {
          name: displayName,
          matrix: matrixToSave,
        });
        onSaved(doc);
        onClose();
        return;
      }
      const doc = await cloudApi.updateRubric(orgId, notebookId, rubric!.id, {
        name: displayName,
        matrix: matrixToSave,
      });
      onSaved(doc);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = isEdit
    ? "Edit rubric"
    : newMode === "choose"
      ? "New rubric"
      : "Create rubric";

  const footer = showEditor ? (
    <>
      <div className="mr-auto flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setMatrix((m) => addCriterionToMatrix(m))}
        >
          <Plus size={14} /> Criterion
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setMatrix((m) => addLevelColumnToMatrix(m))}
        >
          <Plus size={14} /> Level
        </Button>
      </div>
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => void onSave()}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {isEdit ? "Save" : "Save & create"}
      </Button>
    </>
  ) : (
    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
      Cancel
    </Button>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      // Keep create dialog at a fixed size so choose → manual doesn't resize/animate.
      size={isEdit ? "xl" : "md"}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        {!isEdit && newMode === "choose" ? (
          <>
            <p className="text-nb-caption text-nb-on-surface-variant">
              Choose how to build this rubric. Nothing is saved until extract finishes or you
              hit Save on a manual matrix.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setNewMode("manual");
                  setName("");
                  setMatrix(blankMatrix(""));
                }}
                className="flex flex-col items-start gap-2 rounded-nb-lg border border-nb-outline-variant/30 px-4 py-4 text-left transition-colors hover:border-nb-primary/40 hover:bg-nb-surface-low"
              >
                <Pencil size={18} className="text-nb-primary" />
                <span className="text-nb-label font-semibold text-nb-on-surface">
                  Edit manually
                </span>
                <span className="text-nb-caption text-nb-on-surface-variant">
                  Build criteria and levels yourself, then Save to create.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-start gap-2 rounded-nb-lg border border-nb-outline-variant/30 px-4 py-4 text-left transition-colors hover:border-nb-primary/40 hover:bg-nb-surface-low"
              >
                {busy ? (
                  <Loader2 size={18} className="animate-spin text-nb-primary" />
                ) : (
                  <FileText size={18} className="text-nb-primary" />
                )}
                <span className="text-nb-label font-semibold text-nb-on-surface">
                  Extract from document
                </span>
                <span className="text-nb-caption text-nb-on-surface-variant">
                  Upload a PDF/DOCX. Named from the filename; we notify when ready.
                </span>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickDocument(f);
                e.target.value = "";
              }}
            />
          </>
        ) : (
          <>
            <p className="text-nb-caption text-nb-on-surface-variant">
              {isEdit
                ? "Edit the name and criteria × levels matrix, then Save."
                : "Edit the matrix, then Save to create this rubric."}
            </p>

            {!isEdit && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setNewMode("choose");
                    setName("");
                    setMatrix(blankMatrix());
                    setError(null);
                  }}
                >
                  <Upload size={14} /> Back to options
                </Button>
              </div>
            )}

            <label className="flex flex-col gap-1 text-nb-caption text-nb-on-surface-variant">
              Name
              <input
                className="rounded-nb-md border border-nb-outline-variant/40 bg-nb-surface px-2 py-1.5 text-nb-on-surface"
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder="Engineering Notebook Rubric"
              />
            </label>

            <RubricMatrixEditor matrix={matrix} onChange={setMatrix} />
          </>
        )}
      </div>
    </Dialog>
  );
}
