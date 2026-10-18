/** Shared title/caption incomplete messages for resource node chrome. */
export function resourceMetaErrors(
  title: string | null | undefined,
  caption: string | null | undefined,
  kind: "image" | "code block" | "equation" | "table"
): string[] {
  const errors: string[] = [];
  if (!String(title ?? "").trim()) errors.push(`Title is required for this ${kind}.`);
  if (!String(caption ?? "").trim()) errors.push(`Caption is required for this ${kind}.`);
  return errors;
}
