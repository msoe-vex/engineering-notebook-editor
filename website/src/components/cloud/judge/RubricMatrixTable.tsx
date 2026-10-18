"use client";

import type { RubricMatrixPayload } from "@/lib/cloud/api";
import { levelColumns } from "./rubricMatrixUtils";

type Props = {
  matrix: RubricMatrixPayload;
  /** When set, that level cell is highlighted per criterion. */
  awardedByCategoryId?: Record<
    string,
    { levelId?: string; levelIndex?: number; awardedPoints?: number }
  >;
  className?: string;
};

/**
 * Standard criteria × levels matrix:
 * Criteria | Level 1 (pts) | … | Level N (pts) | Total
 */
export function RubricMatrixTable({ matrix, awardedByCategoryId, className }: Props) {
  const cols = levelColumns(matrix);
  const showHighlight = Boolean(awardedByCategoryId);

  return (
    <div className={`overflow-x-auto rounded-nb-lg border border-nb-outline-variant/25 ${className || ""}`}>
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead className="bg-nb-surface-low text-nb-on-surface">
          <tr>
            <th className="sticky left-0 z-[1] bg-nb-surface-low px-3 py-2.5 text-nb-label font-bold">
              Criteria
            </th>
            {cols.map((col) => (
              <th
                key={col.index}
                className="min-w-[9rem] px-3 py-2.5 text-nb-label font-bold"
              >
                {col.header}
              </th>
            ))}
            <th className="px-3 py-2.5 text-nb-label font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.categories.map((cat) => {
            const award = awardedByCategoryId?.[cat.id];
            let highlightIdx = award?.levelIndex;
            if (highlightIdx == null && award) {
              highlightIdx = cat.levels.findIndex(
                (l) =>
                  (award.levelId && l.id === award.levelId) ||
                  (award.awardedPoints != null && l.points === award.awardedPoints)
              );
              if (highlightIdx < 0) highlightIdx = undefined;
            }
            return (
              <tr
                key={cat.id}
                className="group/row border-t border-nb-outline-variant/20 align-top hover:bg-nb-surface-low/60"
              >
                <td className="sticky left-0 z-[1] bg-nb-surface px-3 py-2.5 text-nb-body font-semibold text-nb-on-surface transition-colors group-hover/row:bg-nb-surface-low">
                  {cat.section ? (
                    <span className="mb-0.5 block text-[0.65rem] font-normal uppercase tracking-wide text-nb-on-surface-variant">
                      {cat.section}
                    </span>
                  ) : null}
                  {cat.name}
                </td>
                {cols.map((col) => {
                  const level = cat.levels[col.index];
                  const highlighted = showHighlight && highlightIdx === col.index;
                  return (
                    <td
                      key={col.index}
                      className={`px-3 py-2.5 text-nb-caption leading-snug text-nb-on-surface-variant transition-colors hover:bg-nb-primary/10 hover:text-nb-on-surface ${
                        highlighted
                          ? "bg-nb-primary/15 font-medium text-nb-on-surface ring-1 ring-inset ring-nb-primary/40"
                          : ""
                      }`}
                    >
                      {level?.description?.trim() || (
                        <span className="opacity-40">{level ? "—" : ""}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-nb-body font-semibold tabular-nums text-nb-on-surface">
                  {showHighlight && award?.awardedPoints != null
                    ? `${award.awardedPoints}/${cat.maxPoints}`
                    : cat.maxPoints}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-nb-outline-variant/40 bg-nb-surface-low text-nb-body font-bold text-nb-on-surface">
            <td className="sticky left-0 z-[1] bg-nb-surface-low px-3 py-2.5">Total</td>
            {cols.map((col) => (
              <td key={col.index} className="px-3 py-2.5" />
            ))}
            <td className="px-3 py-2.5 tabular-nums">
              {showHighlight
                ? `${Object.values(awardedByCategoryId || {}).reduce(
                    (s, a) => s + (a.awardedPoints || 0),
                    0
                  )}/${matrix.totalMaxPoints}`
                : matrix.totalMaxPoints}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
