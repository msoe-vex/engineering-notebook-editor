"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import type { RubricRecord } from "@/lib/cloud/api";

type Props = {
  rubrics: RubricRecord[];
  onOpenRubric: (id: string) => void;
  onNewRubric: () => void;
  isArchived?: boolean;
};

export function RubricsGridView({ rubrics, onOpenRubric, onNewRubric, isArchived }: Props) {
  if (rubrics.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-nb-body text-nb-on-surface-variant">
          {isArchived ? "No rubrics in this notebook." : "Create a rubric to get started."}
        </p>
        {!isArchived && (
          <Button variant="primary" size="sm" onClick={onNewRubric}>
            <Plus size={14} /> New rubric
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-nb-title font-bold text-nb-on-surface">All rubrics</h2>
          <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
            {rubrics.length} {rubrics.length === 1 ? "rubric" : "rubrics"} for this notebook.
          </p>
        </div>
        {!isArchived && (
          <Button variant="secondary" size="sm" onClick={onNewRubric}>
            <Plus size={14} /> New rubric
          </Button>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rubrics.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpenRubric(r.id)}
              className="flex h-full w-full flex-col items-start gap-2 rounded-nb-lg border border-nb-outline-variant/25 px-4 py-4 text-left transition-colors hover:border-nb-primary/40 hover:bg-nb-surface-low"
            >
              <span className="line-clamp-2 text-nb-label font-semibold text-nb-on-surface">
                {r.name || "Rubric"}
              </span>
              <span className="mt-auto text-nb-caption text-nb-on-surface-variant">
                {r.matrix
                  ? `${r.matrix.categories.length} criteria · ${r.matrix.totalMaxPoints} pts`
                  : "No matrix yet"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
