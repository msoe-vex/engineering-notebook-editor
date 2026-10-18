"use client";

import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";
import type { JudgmentRecord } from "@/lib/cloud/api";
import { LinkedFeedbackText } from "./linkedFeedbackText";
import { RubricMatrixTable } from "./RubricMatrixTable";
import { ScoreDial } from "./ScoreDial";

type Props = {
  judgment: JudgmentRecord;
  basePath: string;
};

export function JudgmentResultView({ judgment, basePath }: Props) {
  const categories = judgment.categories || [];
  const [showMatrix, setShowMatrix] = useState(false);

  const awardedByCategoryId: Record<
    string,
    { levelId?: string; awardedPoints?: number }
  > = {};
  for (const c of categories) {
    awardedByCategoryId[c.categoryId] = {
      levelId: c.levelId,
      awardedPoints: c.awardedPoints,
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-4 rounded-nb-lg border border-nb-outline-variant/25 bg-nb-surface-low px-4 py-3">
        <ScoreDial
          points={judgment.totalPoints ?? 0}
          maxPoints={judgment.totalMaxPoints ?? 0}
          size={104}
        />
        <div className="min-w-0 flex-1 py-1">
          {judgment.rubricName && (
            <p className="text-nb-label font-semibold text-nb-on-surface">
              {judgment.rubricName}
            </p>
          )}
          {judgment.summary && (
            <p className="mt-1.5 text-nb-body text-nb-on-surface-variant">
              <LinkedFeedbackText text={judgment.summary} basePath={basePath} />
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-nb-label font-bold text-nb-on-surface">Feedback</h3>
        {categories.length === 0 ? (
          <p className="text-nb-caption text-nb-on-surface-variant">No category scores.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {categories.map((c) => {
              const ratio =
                c.maxPoints > 0
                  ? Math.max(0, Math.min(1, c.awardedPoints / c.maxPoints))
                  : 0;
              return (
                <li
                  key={c.categoryId}
                  className="overflow-hidden rounded-nb-lg border border-nb-outline-variant/25 bg-nb-surface"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-nb-body font-semibold text-nb-on-surface">
                        {c.categoryName}
                      </p>
                      <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                        {c.levelLabel || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-nb-md bg-nb-surface-low px-2 py-1 text-nb-label font-bold tabular-nums text-nb-on-surface">
                      {c.awardedPoints}
                      <span className="font-medium text-nb-on-surface-variant">
                        /{c.maxPoints}
                      </span>
                    </span>
                  </div>
                  <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-nb-outline-variant/25">
                    <div
                      className="h-full rounded-full bg-nb-primary transition-[width] duration-300"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                  <div className="border-t border-nb-outline-variant/15 bg-nb-surface-low/50 px-4 py-3">
                    {c.rationale?.trim() ? (
                      <p className="text-nb-body leading-relaxed text-nb-on-surface-variant">
                        <LinkedFeedbackText text={c.rationale} basePath={basePath} />
                      </p>
                    ) : (
                      <p className="text-nb-caption text-nb-on-surface-variant/70">
                        No feedback for this criterion.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {judgment.matrix?.categories?.length ? (
        <div>
          <button
            type="button"
            aria-expanded={showMatrix}
            onClick={() => setShowMatrix((v) => !v)}
            className="inline-flex items-center gap-1.5 text-nb-caption font-medium text-nb-on-surface-variant transition-colors hover:text-nb-primary"
          >
            <Table2 size={14} />
            {showMatrix ? "Hide full matrix" : "Show full matrix"}
            <ChevronDown
              size={14}
              className={`transition-transform ${showMatrix ? "rotate-180" : ""}`}
            />
          </button>
          {showMatrix && (
            <div className="mt-2">
              <RubricMatrixTable
                matrix={judgment.matrix}
                awardedByCategoryId={awardedByCategoryId}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
