"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collabDocName } from "@engineering-notebook/shared";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi, collabWsUrl } from "@/lib/cloud/api";
import { getIdToken } from "@/lib/cloud/firebase";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";

type EntryMeta = {
  title: string;
  folderId: string | null;
  order: number;
  date: string;
  phase: string | null;
};

export default function NotebookWorkspacePage() {
  const params = useParams();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);
  const [notebookName, setNotebookName] = useState("Notebook");
  const [folders, setFolders] = useState<
    Record<string, { name: string; parentId: string | null; order: number }>
  >({});
  const [entries, setEntries] = useState<Record<string, EntryMeta>>({});
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  async function refresh() {
    try {
      const [nb, entryRes] = await Promise.all([
        cloudApi.getNotebook(orgId, notebookId),
        cloudApi.listEntries(orgId, notebookId),
      ]);
      setNotebookName(nb.name);
      setFolders(nb.folders ?? {});
      setEntries(entryRes.entries);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [orgId, notebookId]);

  const explorer = useMemo(() => {
    const rootEntries = Object.entries(entries)
      .filter(([, e]) => !e.folderId)
      .sort((a, b) => a[1].order - b[1].order);
    const folderList = Object.entries(folders).sort((a, b) => a[1].order - b[1].order);
    return { rootEntries, folderList };
  }, [entries, folders]);

  const docName = activeEntryId
    ? collabDocName(orgId, notebookId, activeEntryId)
    : null;

  return (
    <CloudShell title={notebookName}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/cloud/orgs/${orgId}`} className="text-sm text-neutral-500 underline">
            Notebooks
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{notebookName}</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            onClick={() => {
              void cloudApi
                .createEntry(orgId, notebookId, "New Entry")
                .then((e) => {
                  setActiveEntryId(e.id);
                  return refresh();
                })
                .catch((err) => setError((err as Error).message));
            }}
          >
            New entry
          </button>
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            onClick={() => {
              void cloudApi
                .auditNotebook(orgId, notebookId, { provider: "byok" })
                .then((r) => setAuditResult(JSON.stringify(r, null, 2)))
                .catch((err) => setError((err as Error).message));
            }}
          >
            Run rubric audit
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded border border-neutral-200 bg-white p-3 text-sm">
          <p className="mb-2 font-medium">Explorer</p>
          {explorer.folderList.map(([folderId, folder]) => (
            <div key={folderId} className="mb-2">
              <div className="text-neutral-500">{folder.name}</div>
              <ul className="ml-2">
                {Object.entries(entries)
                  .filter(([, e]) => e.folderId === folderId)
                  .sort((a, b) => a[1].order - b[1].order)
                  .map(([id, e]) => (
                    <li key={id}>
                      <button
                        className={`w-full text-left hover:underline ${activeEntryId === id ? "font-semibold" : ""}`}
                        onClick={() => setActiveEntryId(id)}
                      >
                        {e.title}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <ul>
            {explorer.rootEntries.map(([id, e]) => (
              <li key={id}>
                <button
                  className={`w-full text-left hover:underline ${activeEntryId === id ? "font-semibold" : ""}`}
                  onClick={() => setActiveEntryId(id)}
                >
                  {e.title}
                </button>
              </li>
            ))}
          </ul>
          {!Object.keys(entries).length && (
            <p className="text-neutral-500">No entries yet.</p>
          )}
          <p className="mt-4 text-xs text-neutral-400">Collab: {collabWsUrl()}</p>
        </aside>
        <section className="min-h-105 rounded border border-neutral-200 bg-white p-4">
          {activeEntryId && docName ? (
            <CollaborativeEntryEditor
              documentName={docName}
              entryTitle={entries[activeEntryId]?.title ?? "Entry"}
              getToken={getIdToken}
            />
          ) : (
            <p className="text-sm text-neutral-500">Select or create an entry to edit.</p>
          )}
        </section>
      </div>
      {auditResult && (
        <pre className="mt-6 overflow-auto rounded border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
          {auditResult}
        </pre>
      )}
    </CloudShell>
  );
}
