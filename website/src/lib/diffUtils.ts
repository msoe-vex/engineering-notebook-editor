export type DiffLineType = "added" | "deleted" | "unchanged" | "collapsed";

export interface DiffLine {
  type: DiffLineType;
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
  /** Count of hidden lines if type === 'collapsed' */
  collapsedCount?: number;
  /** Hidden lines if type === 'collapsed' */
  hiddenLines?: DiffLine[];
}

export interface FileDiffResult {
  additions: number;
  deletions: number;
  lines: DiffLine[];
  allLines: DiffLine[];
}

/**
 * Computes a line-by-line diff using standard LCS algorithm.
 * Supports context lines around changes (default: 3 lines context).
 */
export function computeLineDiff(
  oldText: string = "",
  newText: string = "",
  contextLines: number = 3
): FileDiffResult {
  // Normalize line endings
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) {
    return { additions: 0, deletions: 0, lines: [], allLines: [] };
  }

  if (m === 0) {
    const lines: DiffLine[] = newLines.map((content, idx) => ({
      type: "added",
      newLineNumber: idx + 1,
      content
    }));
    return { additions: n, deletions: 0, lines, allLines: lines };
  }

  if (n === 0) {
    const lines: DiffLine[] = oldLines.map((content, idx) => ({
      type: "deleted",
      oldLineNumber: idx + 1,
      content
    }));
    return { additions: 0, deletions: m, lines, allLines: lines };
  }

  // DP table for Longest Common Subsequence
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const rawDiff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.unshift({
        type: "unchanged",
        oldLineNumber: i,
        newLineNumber: j,
        content: oldLines[i - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.unshift({
        type: "added",
        newLineNumber: j,
        content: newLines[j - 1]
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.unshift({
        type: "deleted",
        oldLineNumber: i,
        content: oldLines[i - 1]
      });
      i--;
    }
  }

  let additions = 0;
  let deletions = 0;
  for (const line of rawDiff) {
    if (line.type === "added") additions++;
    else if (line.type === "deleted") deletions++;
  }

  // Compute collapsed hunks with contextLines
  const hunkLines = collapseDiffContext(rawDiff, contextLines);

  return {
    additions,
    deletions,
    lines: hunkLines,
    allLines: rawDiff
  };
}

/**
 * Collapses long runs of unchanged lines leaving `context` lines before and after changes.
 */
export function collapseDiffContext(rawDiff: DiffLine[], context: number = 3): DiffLine[] {
  if (rawDiff.length === 0) return [];

  // Identify indices of changed lines
  const changedIndices: boolean[] = rawDiff.map(l => l.type === "added" || l.type === "deleted");
  const isIncluded: boolean[] = new Array(rawDiff.length).fill(false);

  // If no changes, collapse everything if long enough
  const hasChanges = changedIndices.some(Boolean);
  if (!hasChanges) {
    if (rawDiff.length <= context * 2 + 2) {
      return [...rawDiff];
    }
    return [
      ...rawDiff.slice(0, context),
      {
        type: "collapsed",
        content: `... ${rawDiff.length - context * 2} unchanged lines ...`,
        collapsedCount: rawDiff.length - context * 2,
        hiddenLines: rawDiff.slice(context, rawDiff.length - context)
      },
      ...rawDiff.slice(rawDiff.length - context)
    ];
  }

  // Mark lines within `context` distance of any change
  for (let idx = 0; idx < rawDiff.length; idx++) {
    if (changedIndices[idx]) {
      const start = Math.max(0, idx - context);
      const end = Math.min(rawDiff.length - 1, idx + context);
      for (let k = start; k <= end; k++) {
        isIncluded[k] = true;
      }
    }
  }

  const result: DiffLine[] = [];
  let k = 0;

  while (k < rawDiff.length) {
    if (isIncluded[k]) {
      result.push(rawDiff[k]);
      k++;
    } else {
      // Find length of consecutive omitted lines
      const omittedStart = k;
      while (k < rawDiff.length && !isIncluded[k]) {
        k++;
      }
      const omittedLines = rawDiff.slice(omittedStart, k);
      if (omittedLines.length <= 2) {
        // If only 1 or 2 lines, don't bother collapsing
        result.push(...omittedLines);
      } else {
        result.push({
          type: "collapsed",
          content: `... ${omittedLines.length} unchanged lines ...`,
          collapsedCount: omittedLines.length,
          hiddenLines: omittedLines
        });
      }
    }
  }

  return result;
}

