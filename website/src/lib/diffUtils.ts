export interface DiffLine {
  type: "added" | "deleted" | "unchanged";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface FileDiffResult {
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

/**
 * Computes a line-by-line diff using standard LCS algorithm.
 */
export function computeLineDiff(oldText: string = "", newText: string = ""): FileDiffResult {
  // Normalize line endings
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) {
    return { additions: 0, deletions: 0, lines: [] };
  }

  if (m === 0) {
    const lines: DiffLine[] = newLines.map((content, idx) => ({
      type: "added",
      newLineNumber: idx + 1,
      content
    }));
    return { additions: n, deletions: 0, lines };
  }

  if (n === 0) {
    const lines: DiffLine[] = oldLines.map((content, idx) => ({
      type: "deleted",
      oldLineNumber: idx + 1,
      content
    }));
    return { additions: 0, deletions: m, lines };
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

  return {
    additions,
    deletions,
    lines: rawDiff
  };
}
