"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { cloudApi } from "@/lib/cloud/api";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function entryDisplayName(
  entries: Record<string, { title?: string }>,
  id: string
): string {
  const title = entries[id]?.title?.trim();
  return title || "Untitled";
}

function assetLabel(contentType?: string): string {
  if (!contentType) return "Asset";
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.startsWith("video/")) return "Video";
  if (contentType.includes("pdf")) return "PDF";
  return "Asset";
}

function useResolveNotebookRef(basePath: string) {
  const { orgId, notebookId, entries, assets } = useNotebookWorkspace();
  const assetById = new Map(assets.map((a) => [a.id, a]));

  function resolve(id: string): {
    label: string;
    href?: string;
    kind: "entry" | "asset" | "unknown";
  } {
    if (entries[id]) {
      return {
        kind: "entry",
        label: entryDisplayName(entries, id),
        href: `${basePath}/entries/${id}`,
      };
    }
    const asset = assetById.get(id);
    if (asset) {
      const hostEntry = Object.entries(entries).find(([, e]) =>
        (e.assetIds || []).includes(id)
      );
      if (hostEntry) {
        return {
          kind: "asset",
          label: `${assetLabel(asset.contentType)} in ${entryDisplayName(entries, hostEntry[0])}`,
          href: `${basePath}/entries/${hostEntry[0]}`,
        };
      }
      return {
        kind: "asset",
        label: assetLabel(asset.contentType),
        href: undefined,
      };
    }
    return { kind: "unknown", label: id.slice(0, 8) + "…" };
  }

  async function openAsset(id: string) {
    const { url } = await cloudApi.getAssetUrl(orgId, notebookId, id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return { resolve, openAsset, entries };
}

function RefLink({
  id,
  basePath,
  className,
}: {
  id: string;
  basePath: string;
  className?: string;
}) {
  const { resolve, openAsset } = useResolveNotebookRef(basePath);
  const ref = resolve(id);
  const cls =
    className ||
    "font-medium text-nb-primary underline-offset-2 hover:underline";

  if (ref.href) {
    return (
      <Link href={ref.href} className={cls}>
        {ref.label}
      </Link>
    );
  }
  if (ref.kind === "asset") {
    return (
      <button type="button" className={cls} onClick={() => void openAsset(id)}>
        {ref.label}
      </button>
    );
  }
  return <span className="font-mono text-nb-on-surface-variant">{ref.label}</span>;
}

/**
 * Shared helper: render feedback/summary text with notebook UUIDs turned into
 * entry/asset links (by title when known). Use anywhere judge text is shown.
 */
export function LinkedFeedbackText({
  text,
  basePath,
  className,
}: {
  text: string;
  basePath: string;
  className?: string;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(UUID_RE.source, "gi");
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={`t-${key++}`}>{text.slice(last, m.index)}</Fragment>);
    }
    const id = m[0];
    parts.push(<RefLink key={`r-${key++}`} id={id} basePath={basePath} />);
    last = m.index + id.length;
  }
  if (last < text.length) {
    parts.push(<Fragment key={`t-${key++}`}>{text.slice(last)}</Fragment>);
  }
  return <span className={className}>{parts.length ? parts : text}</span>;
}
