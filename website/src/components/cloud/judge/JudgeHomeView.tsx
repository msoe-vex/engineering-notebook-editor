"use client";

import { Gavel, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import type { JudgmentRecord } from "@/lib/cloud/api";
import { LinkedFeedbackText } from "./linkedFeedbackText";
import { ScoreDial } from "./ScoreDial";

type Props = {
  grades: JudgmentRecord[];
  hasRubrics: boolean;
  basePath: string;
  onOpenGrade: (id: string) => void;
  onNewRubric: () => void;
  isArchived?: boolean;
};

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

export function JudgeHomeView({
  grades,
  hasRubrics,
  basePath,
  onOpenGrade,
  onNewRubric,
  isArchived,
}: Props) {
  const completed = grades.filter((g) => g.status === "completed");
  const latest = completed[0] || null;

  if (!hasRubrics && grades.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-nb-body text-nb-on-surface-variant">
          {isArchived ? "No rubrics or grades in this notebook." : "Create a rubric to get started."}
        </p>
        {!isArchived && (
          <Button variant="primary" size="sm" onClick={onNewRubric}>
            <Plus size={14} /> New rubric
          </Button>
        )}
      </div>
    );
  }

  if (completed.length === 0) {
    return (
      <div className="flex h-full max-w-md flex-col justify-center gap-3">
        <div className="flex items-center gap-2 text-nb-on-surface">
          <Gavel size={20} className="text-nb-on-surface-variant" />
          <h2 className="text-nb-title font-bold">Past grades</h2>
        </div>
        <p className="text-nb-body text-nb-on-surface-variant">
          {hasRubrics
            ? (isArchived
                ? "No completed grades in this notebook."
                : "No completed grades yet. Select a ready rubric and run judge to see scores here.")
            : (isArchived
                ? "No completed grades in this notebook."
                : "Create a rubric, then run judge to see scores here.")}
        </p>
        {!hasRubrics && !isArchived && (
          <Button variant="primary" size="sm" className="self-start" onClick={onNewRubric}>
            <Plus size={14} /> New rubric
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-nb-title font-bold text-nb-on-surface">Recent scores</h2>
        <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
          Latest completed grades for this notebook.
        </p>
      </div>

      {latest && (
        <div className="w-full max-w-lg overflow-hidden rounded-nb-lg border border-nb-outline-variant/25 bg-nb-surface-low transition-colors hover:border-nb-primary/40">
          <button
            type="button"
            onClick={() => onOpenGrade(latest.id)}
            className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-nb-surface/60"
          >
            <ScoreDial
              points={latest.totalPoints ?? 0}
              maxPoints={latest.totalMaxPoints ?? 0}
              size={120}
            />
            <div className="min-w-0 flex-1">
              <p className="text-nb-label font-semibold text-nb-on-surface">
                {latest.rubricName || "Grade"}
              </p>
              <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                {formatWhen(latest.createdAt)} · Latest
              </p>
            </div>
          </button>
          {latest.summary && (
            <div className="border-t border-nb-outline-variant/20 px-5 py-3">
              <p className="line-clamp-4 text-nb-body text-nb-on-surface-variant">
                <LinkedFeedbackText text={latest.summary} basePath={basePath} />
              </p>
            </div>
          )}
        </div>
      )}

      {completed.length > 1 && (
        <div>
          <h3 className="mb-2 text-nb-label font-bold text-nb-on-surface">History</h3>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {completed.slice(1).map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onOpenGrade(g.id)}
                  className="flex h-full w-full items-center gap-3 rounded-nb-lg border border-nb-outline-variant/25 px-3 py-3 text-left transition-colors hover:border-nb-primary/40 hover:bg-nb-surface-low"
                >
                  <ScoreDial
                    points={g.totalPoints ?? 0}
                    maxPoints={g.totalMaxPoints ?? 0}
                    size={72}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-nb-label font-semibold text-nb-on-surface">
                      {g.rubricName || "Grade"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-nb-on-surface-variant">
                      {formatWhen(g.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
