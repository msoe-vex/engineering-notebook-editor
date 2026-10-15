"use client";

import { useParams, useRouter } from "next/navigation";
import { collabDocName } from "@engineering-notebook/shared";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
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
    refresh,
    setError,
    showConfirm,
    showPrompt,
  } = useNotebookWorkspace();
  const meta = entries[entryId];
  const docName = collabDocName(orgId, notebookId, entryId);

  if (Object.keys(entries).length > 0 && !meta) {
    return (
      <p className="text-sm text-red-600">
        Entry not found.{" "}
        <button
          className="underline"
          onClick={() => router.push(`/orgs/${orgId}/notebooks/${notebookId}`)}
        >
          Back to notebook
        </button>
      </p>
    );
  }

  const title = meta?.title ?? "Entry";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-3">
        <span className="text-sm font-medium text-neutral-900">{title}</span>
        <button
          className="text-xs text-neutral-500 underline"
          onClick={() =>
            showPrompt("Rename entry", title, (next) => {
              void cloudApi
                .patchEntry(orgId, notebookId, entryId, { title: next })
                .then(refresh)
                .catch((err) => setError((err as Error).message));
            })
          }
        >
          Rename
        </button>
        <button
          className="text-xs text-neutral-500 underline"
          onClick={() => {
            void cloudApi
              .patchEntry(orgId, notebookId, entryId, {
                isTemplate: !meta?.isTemplate,
              })
              .then(refresh)
              .catch((err) => setError((err as Error).message));
          }}
        >
          {meta?.isTemplate ? "Unset template" : "Mark template"}
        </button>
        <button
          className="text-xs text-red-600 underline"
          onClick={() =>
            showConfirm(
              "Delete entry?",
              `Delete "${title}"? This cannot be undone.`,
              () => {
                void cloudApi
                  .deleteEntry(orgId, notebookId, entryId)
                  .then(() => {
                    refresh();
                    router.push(`/orgs/${orgId}/notebooks/${notebookId}`);
                  })
                  .catch((err) => setError((err as Error).message));
              },
              "danger"
            )
          }
        >
          Delete entry
        </button>
      </div>
      <CollaborativeEntryEditor
        key={entryId}
        documentName={docName}
        entryTitle={title}
        entryId={entryId}
        getToken={getIdToken}
      />
    </>
  );
}
