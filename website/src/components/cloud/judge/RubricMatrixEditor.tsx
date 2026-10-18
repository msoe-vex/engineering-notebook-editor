"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { RubricMatrixPayload } from "@/lib/cloud/api";
import {
  blankCriterion,
  blankLevel,
  levelColumns,
  recomputeTotals,
} from "./rubricMatrixUtils";

type Props = {
  matrix: RubricMatrixPayload;
  onChange: (next: RubricMatrixPayload) => void;
};

export function RubricMatrixEditor({ matrix, onChange }: Props) {
  const cols = levelColumns(matrix);

  function update(next: RubricMatrixPayload) {
    onChange(recomputeTotals(next));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-nb-lg border border-nb-outline-variant/25">
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-nb-caption">
          <thead className="bg-nb-surface-low text-nb-on-surface-variant">
            <tr>
              <th className="w-[12rem] min-w-[12rem] px-2 py-2 font-semibold">Criteria</th>
              {cols.map((col) => (
                <th key={col.index} className="w-[14rem] min-w-[14rem] px-2 py-2 font-semibold">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <input
                        className="min-w-0 flex-1 rounded border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1 text-nb-on-surface"
                        value={matrix.categories[0]?.levels[col.index]?.label || col.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          update({
                            ...matrix,
                            categories: matrix.categories.map((c) => ({
                              ...c,
                              levels: c.levels.map((l, i) =>
                                i === col.index ? { ...l, label } : l
                              ),
                            })),
                          });
                        }}
                        aria-label={`Level ${col.index + 1} label`}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-nb-on-surface-variant hover:bg-nb-error/10 hover:text-nb-error disabled:opacity-40"
                        disabled={cols.length <= 2}
                        title="Delete this level column"
                        aria-label={`Delete level column ${col.index + 1}`}
                        onClick={() =>
                          update({
                            ...matrix,
                            categories: matrix.categories.map((c) => ({
                              ...c,
                              levels: c.levels.filter((_, i) => i !== col.index),
                            })),
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <input
                      type="number"
                      className="w-20 rounded border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1 text-nb-on-surface"
                      value={matrix.categories[0]?.levels[col.index]?.points ?? col.points}
                      onChange={(e) => {
                        const points = Number(e.target.value) || 0;
                        update({
                          ...matrix,
                          categories: matrix.categories.map((c) => ({
                            ...c,
                            levels: c.levels.map((l, i) =>
                              i === col.index ? { ...l, points } : l
                            ),
                          })),
                        });
                      }}
                      aria-label={`Level ${col.index + 1} points`}
                    />
                  </div>
                </th>
              ))}
              <th className="w-[4.5rem] min-w-[4.5rem] px-2 py-2 font-semibold">Total</th>
              <th className="w-10 min-w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {matrix.categories.map((cat, rowIdx) => (
              <tr key={cat.id} className="border-t border-nb-outline-variant/20 align-top">
                <td className="w-[12rem] min-w-[12rem] px-2 py-2">
                  <input
                    className="mb-1 w-full rounded border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1 font-medium text-nb-on-surface"
                    value={cat.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      update({
                        ...matrix,
                        categories: matrix.categories.map((c, i) =>
                          i === rowIdx ? { ...c, name } : c
                        ),
                      });
                    }}
                    placeholder="Criterion"
                  />
                  <input
                    className="w-full rounded border border-nb-outline-variant/20 bg-nb-surface px-1.5 py-1 text-nb-on-surface-variant"
                    value={cat.section || ""}
                    onChange={(e) => {
                      const section = e.target.value;
                      update({
                        ...matrix,
                        categories: matrix.categories.map((c, i) =>
                          i === rowIdx ? { ...c, section: section || undefined } : c
                        ),
                      });
                    }}
                    placeholder="Section (optional)"
                  />
                </td>
                {cols.map((col) => {
                  const level = cat.levels[col.index];
                  return (
                    <td key={col.index} className="w-[14rem] min-w-[14rem] px-2 py-2">
                      <textarea
                        className="min-h-[4.5rem] w-full min-w-0 resize-y rounded border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1 text-nb-on-surface-variant"
                        value={level?.description || ""}
                        onChange={(e) => {
                          const description = e.target.value;
                          update({
                            ...matrix,
                            categories: matrix.categories.map((c, i) => {
                              if (i !== rowIdx) return c;
                              const levels = [...c.levels];
                              while (levels.length <= col.index) {
                                levels.push(blankLevel(levels.length));
                              }
                              levels[col.index] = {
                                ...levels[col.index],
                                description,
                              };
                              return { ...c, levels };
                            }),
                          });
                        }}
                        placeholder="Description"
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 font-semibold text-nb-on-surface">{cat.maxPoints}</td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    className="rounded p-1 text-nb-on-surface-variant hover:bg-nb-error/10 hover:text-nb-error"
                    disabled={matrix.categories.length <= 1}
                    onClick={() =>
                      update({
                        ...matrix,
                        categories: matrix.categories.filter((_, i) => i !== rowIdx),
                      })
                    }
                    aria-label="Remove criterion"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-nb-outline-variant/40 bg-nb-surface-low font-semibold">
              <td className="px-2 py-2 text-nb-on-surface">Total</td>
              {cols.map((col) => (
                <td key={col.index} className="px-2 py-2" />
              ))}
              <td className="px-2 py-2 text-nb-on-surface">{matrix.totalMaxPoints}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}

export function addCriterionToMatrix(matrix: RubricMatrixPayload): RubricMatrixPayload {
  const cols = levelColumns(matrix);
  return recomputeTotals({
    ...matrix,
    categories: [
      ...matrix.categories,
      blankCriterion(matrix.categories.length, cols.length || 4),
    ],
  });
}

export function addLevelColumnToMatrix(matrix: RubricMatrixPayload): RubricMatrixPayload {
  const cols = levelColumns(matrix);
  const idx = cols.length;
  return recomputeTotals({
    ...matrix,
    categories: matrix.categories.map((c) => ({
      ...c,
      levels: [...c.levels, blankLevel(idx)],
    })),
  });
}
