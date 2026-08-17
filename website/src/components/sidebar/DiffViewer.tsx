"use client";

import React, { useState, useEffect } from "react";
import { Loader2, X, Plus, Minus, FileCode, Check } from "lucide-react";
import { PendingChange } from "@/lib/db";
import { computeLineDiff, FileDiffResult } from "@/lib/diffUtils";

interface DiffViewerProps {
  change: PendingChange;
  getBaseContent: (path: string) => Promise<string | null>;
  onClose: () => void;
}

export default function DiffViewer({ change, getBaseContent, onClose }: DiffViewerProps) {
  const [diff, setDiff] = useState<FileDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDiff() {
      setIsLoading(true);
      try {
        const isDelete = change.operation === "delete";
        const isNew = change.changeType === "create";

        let baseContent: string | null = "";
        let newContent: string = change.content || "";

        if (isDelete) {
          baseContent = await getBaseContent(change.path);
          newContent = "";
        } else if (isNew) {
          baseContent = "";
        } else {
          baseContent = await getBaseContent(change.path);
        }

        if (isMounted) {
          const result = computeLineDiff(baseContent || "", newContent || "");
          setDiff(result);
        }
      } catch (err) {
        console.error("Failed to compute diff:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDiff();

    return () => {
      isMounted = false;
    };
  }, [change, getBaseContent]);

  const fileName = change.path.split("/").pop() || change.path;

  return (
    <div className="mt-1.5 rounded-xl border border-nb-outline-variant/60 bg-nb-surface-lowest overflow-hidden shadow-nb-sm text-[11px] select-text">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-nb-surface-low/80 border-b border-nb-outline-variant/40 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/60">
            Diff
          </span>
          {diff && !isLoading && (
            <div className="flex items-center gap-1 shrink-0 text-[9px] font-mono font-bold">
              {diff.additions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded">
                  +{diff.additions}
                </span>
              )}
              {diff.deletions > 0 && (
                <span className="text-red-600 dark:text-red-400 bg-red-500/10 px-1 py-0.2 rounded">
                  -{diff.deletions}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-0.5 hover:bg-nb-surface-high/60 rounded text-nb-on-surface-variant/50 hover:text-nb-on-surface transition-colors cursor-pointer shrink-0"
          title="Close Diff"
        >
          <X size={11} />
        </button>
      </div>

      {/* Diff Body */}
      {isLoading ? (
        <div className="flex items-center justify-center p-6 text-nb-on-surface-variant/50 gap-2">
          <Loader2 size={13} className="animate-spin-stable" />
          <span className="text-[10px] font-medium">Computing diff...</span>
        </div>
      ) : !diff || diff.lines.length === 0 ? (
        <div className="p-4 text-center text-[10px] text-nb-on-surface-variant/60 italic">
          No differences found
        </div>
      ) : (
        <div className="max-h-64 overflow-x-auto overflow-y-auto font-mono text-[10px] leading-tight">
          <table className="w-full border-collapse">
            <tbody>
              {diff.lines.map((line, idx) => {
                const isAdded = line.type === "added";
                const isDeleted = line.type === "deleted";

                return (
                  <tr
                    key={idx}
                    className={`
                      ${isAdded ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200" : ""}
                      ${isDeleted ? "bg-red-500/15 dark:bg-red-500/20 text-red-900 dark:text-red-200" : ""}
                      ${!isAdded && !isDeleted ? "text-nb-on-surface-variant hover:bg-nb-surface-low/50" : ""}
                    `}
                  >
                    {/* Old line number */}
                    <td className="w-6 px-1.5 py-0.5 text-right select-none opacity-40 text-[9px] border-r border-nb-outline-variant/20 font-mono">
                      {line.oldLineNumber ?? ""}
                    </td>

                    {/* New line number */}
                    <td className="w-6 px-1.5 py-0.5 text-right select-none opacity-40 text-[9px] border-r border-nb-outline-variant/20 font-mono">
                      {line.newLineNumber ?? ""}
                    </td>

                    {/* Prefix symbol */}
                    <td className="w-4 px-1 py-0.5 text-center select-none font-bold text-[10px]">
                      {isAdded ? "+" : isDeleted ? "-" : " "}
                    </td>

                    {/* Code Content */}
                    <td className="px-1.5 py-0.5 whitespace-pre font-mono break-all">
                      {line.content || " "}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
