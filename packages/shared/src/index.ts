export type ProjectRole = "owner" | "admin" | "member" | "viewer";

export type RubricScorecard = {
  projectId: string;
  rubric: string;
  scores: Record<string, number>;
  advice: Array<{ entryId: string | null; message: string }>;
};
