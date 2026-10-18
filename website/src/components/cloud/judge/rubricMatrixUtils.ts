import type {
  RubricCategoryPayload,
  RubricLevelPayload,
  RubricMatrixPayload,
} from "@/lib/cloud/api";

export type LevelColumn = {
  index: number;
  /** Display header e.g. "Exemplary (4)" */
  header: string;
  label: string;
  points: number;
};

/** Build shared level columns from the widest criterion (by index). */
export function levelColumns(matrix: RubricMatrixPayload | undefined | null): LevelColumn[] {
  if (!matrix?.categories?.length) return [];
  const maxLevels = Math.max(...matrix.categories.map((c) => c.levels?.length || 0), 0);
  const cols: LevelColumn[] = [];
  for (let i = 0; i < maxLevels; i++) {
    const sample =
      matrix.categories.map((c) => c.levels?.[i]).find(Boolean) ||
      ({ id: `l${i}`, label: `Level ${i + 1}`, description: "", points: i + 1 } satisfies RubricLevelPayload);
    cols.push({
      index: i,
      header: `${sample.label} (${sample.points})`,
      label: sample.label,
      points: sample.points,
    });
  }
  return cols;
}

export function recomputeTotals(matrix: RubricMatrixPayload): RubricMatrixPayload {
  const categories = matrix.categories.map((cat) => {
    const maxFromLevels = Math.max(0, ...cat.levels.map((l) => Number(l.points) || 0));
    return { ...cat, maxPoints: maxFromLevels || cat.maxPoints || 0 };
  });
  return {
    ...matrix,
    categories,
    totalMaxPoints: categories.reduce((s, c) => s + c.maxPoints, 0),
  };
}

export function blankLevel(i: number): RubricLevelPayload {
  const defaults = [
    { id: "beginning", label: "Beginning", points: 1 },
    { id: "developing", label: "Developing", points: 2 },
    { id: "proficient", label: "Proficient", points: 3 },
    { id: "exemplary", label: "Exemplary", points: 4 },
  ];
  const d = defaults[i] || {
    id: `level-${i + 1}`,
    label: `Level ${i + 1}`,
    points: i + 1,
  };
  return { ...d, description: "" };
}

export function blankCriterion(index: number, levelCount = 4): RubricCategoryPayload {
  return {
    id: `criterion-${index + 1}-${Date.now().toString(36)}`,
    name: `Criterion ${index + 1}`,
    description: "",
    maxPoints: levelCount,
    levels: Array.from({ length: levelCount }, (_, i) => blankLevel(i)),
  };
}

export function blankMatrix(title = "Custom rubric"): RubricMatrixPayload {
  return recomputeTotals({
    title,
    categories: [blankCriterion(0)],
    totalMaxPoints: 4,
  });
}

export function cloneMatrix(matrix: RubricMatrixPayload): RubricMatrixPayload {
  return JSON.parse(JSON.stringify(matrix)) as RubricMatrixPayload;
}
