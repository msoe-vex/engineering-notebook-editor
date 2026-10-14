"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { saveAs } from "file-saver";
import {
  NOTEBOOK_SCHEMA_VERSION,
  collabDocName,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import { CloudShell } from "@/components/cloud/CloudShell";
import { cloudApi, collabWsUrl } from "@/lib/cloud/api";
import { getIdToken } from "@/lib/cloud/firebase";
import { CollaborativeEntryEditor } from "@/components/cloud/CollaborativeEntryEditor";
import { exportNotebookZipV5, importNotebookZip } from "@/lib/cloud/zipV5";

type EntryMeta = {
  title: string;
  folderId: string | null;
  order: number;
  date: string;
  phase: string | null;
  authors?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export default function NotebookWorkspacePage() {
  const params = useParams();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);
  const [notebookName, setNotebookName] = useState("Notebook");
  const [notebookSummary, setNotebookSummary] = useState<NotebookSummaryV5 | null>(null);
  const [folders, setFolders] = useState<
    Record<string, { name: string; parentId: string | null; order: number }>
  >({});
  const [entries, setEntries] = useState<Record<string, EntryMeta>>({});
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const [nb, entryRes] = await Promise.all([
        cloudApi.getNotebook(orgId, notebookId),
        cloudApi.listEntries(orgId, notebookId),
      ]);
      setNotebookName(nb.name);
      setFolders(nb.folders ?? {});
      setEntries(entryRes.entries);
      setNotebookSummary({
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        orgId,
        name: nb.name,
        folders: nb.folders ?? {},
        team: nb.team as NotebookSummaryV5["team"],
        phases: nb.phases as NotebookSummaryV5["phases"],
        lastCompiled: nb.lastCompiled,
        updatedAt: nb.updatedAt ?? new Date().toISOString(),
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleExportZip() {
    setBusy(true);
    setError(null);
    try {
      const tipTapByEntryId: Record<string, unknown> = {};
      const entryMeta: Record<string, EntryMetadataV5> = {};
      for (const [id, meta] of Object.entries(entries)) {
        entryMeta[id] = {
          title: meta.title,
          authors: meta.authors ?? [],
          phase: meta.phase,
          createdAt: meta.createdAt ?? new Date().toISOString(),
          updatedAt: meta.updatedAt ?? new Date().toISOString(),
          date: meta.date,
          folderId: meta.folderId,
          order: meta.order,
        };
        try {
          tipTapByEntryId[id] = await cloudApi.getEntryContent(orgId, notebookId, id);
        } catch {
          tipTapByEntryId[id] = { type: "doc", content: [] };
        }
      }
      const summary: NotebookSummaryV5 = notebookSummary ?? {
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        orgId,
        name: notebookName,
        folders,
        updatedAt: new Date().toISOString(),
      };
      const blob = await exportNotebookZipV5({
        summary,
        entries: entryMeta,
        tipTapByEntryId,
      });
      saveAs(blob, `${notebookName.replace(/\s+/g, "-").toLowerCase() || "notebook"}.v5.zip`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Last-write-wins ZIP import into this cloud notebook. */
  async function handleImportZip(file: File) {
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { summary, entries: imported, tipTapByEntryId } = await importNotebookZip(
        buf,
        orgId,
        notebookName
      );
      await cloudApi.patchNotebook(orgId, notebookId, {
        name: summary.name || notebookName,
        folders: summary.folders,
        team: summary.team,
        phases: summary.phases,
      });
      for (const [id, meta] of Object.entries(imported)) {
        try {
          await cloudApi.patchEntry(orgId, notebookId, id, meta);
        } catch {
          await cloudApi.createEntry(orgId, notebookId, {
            id,
            title: meta.title,
            folderId: meta.folderId,
            order: meta.order,
            date: meta.date,
            phase: meta.phase,
            authors: meta.authors,
          });
        }
        const doc = tipTapByEntryId[id];
        if (doc !== undefined) {
          await cloudApi.putEntryContent(orgId, notebookId, id, doc);
        }
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/cloud/orgs/${orgId}`} className="text-sm text-neutral-500 underline">
            Notebooks
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{notebookName}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Live sync via GCP (Firestore / GCS / Hocuspocus). ZIP is backup only (last-write-wins on
            import).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              void cloudApi
                .createEntry(orgId, notebookId, { title: "New Entry" })
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
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void handleExportZip()}
          >
            Export ZIP
          </button>
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => importRef.current?.click()}
          >
            Import ZIP
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImportZip(file);
            }}
          />
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
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
        <section className="min-h-[420px] rounded border border-neutral-200 bg-white p-4">
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
