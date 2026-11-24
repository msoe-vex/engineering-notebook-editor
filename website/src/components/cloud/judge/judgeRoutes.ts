export type JudgeSelection =
  | { kind: "home-rubrics" }
  | { kind: "home-grades" }
  | { kind: "rubric"; id: string }
  | { kind: "grade"; id: string };

/** Parse `/…/judge…` pathname into the active Judge view. */
export function selectionFromJudgePath(
  pathname: string,
  notebookBasePath: string
): JudgeSelection {
  const prefix = `${notebookBasePath}/judge`;
  if (pathname === prefix || pathname === `${prefix}/`) {
    return { kind: "home-grades" };
  }
  if (pathname === `${prefix}/grades` || pathname === `${prefix}/grade/`) {
    return { kind: "home-grades" };
  }
  if (pathname === `${prefix}/rubrics` || pathname === `${prefix}/rubric/`) {
    return { kind: "home-rubrics" };
  }

  const rubricMatch = pathname.match(
    new RegExp(`^${escapeRegExp(prefix)}/rubric/([^/]+)/?$`)
  );
  if (rubricMatch?.[1]) {
    return { kind: "rubric", id: decodeURIComponent(rubricMatch[1]) };
  }

  const gradeMatch = pathname.match(
    new RegExp(`^${escapeRegExp(prefix)}/grade/([^/]+)/?$`)
  );
  if (gradeMatch?.[1]) {
    return { kind: "grade", id: decodeURIComponent(gradeMatch[1]) };
  }

  return { kind: "home-grades" };
}

export function pathForJudgeSelection(
  notebookBasePath: string,
  selection: JudgeSelection
): string {
  const prefix = `${notebookBasePath}/judge`;
  switch (selection.kind) {
    case "home-grades":
      return prefix;
    case "home-rubrics":
      return `${prefix}/rubric`;
    case "rubric":
      return `${prefix}/rubric/${selection.id}`;
    case "grade":
      return `${prefix}/grade/${selection.id}`;
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
