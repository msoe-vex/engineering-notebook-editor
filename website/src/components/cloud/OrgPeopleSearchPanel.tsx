"use client";

import { useMemo } from "react";
import { Search, User, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { MemberSummary } from "@/lib/cloud/api";

/**
 * Search-to-add people panel used by Teams and notebook Contributors.
 */
export function OrgPeopleSearchPanel({
  canManage,
  members,
  selected,
  query,
  onQueryChange,
  onAdd,
  onRemove,
  emptySelectedHint,
  /** When false, only the search-to-add UI is shown (caller renders the selected list). */
  showSelectedList = true,
}: {
  canManage: boolean;
  members: MemberSummary[];
  selected: MemberSummary[];
  query: string;
  onQueryChange: (q: string) => void;
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
  emptySelectedHint?: string;
  showSelectedList?: boolean;
}) {
  const q = query.trim().toLowerCase();
  const selectedIds = useMemo(() => new Set(selected.map((m) => m.uid)), [selected]);

  const suggestions = useMemo(() => {
    if (!q) return [] as MemberSummary[];
    return members.filter(
      (m) =>
        !selectedIds.has(m.uid) &&
        ((m.displayName || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q) ||
          m.uid.toLowerCase().includes(q))
    );
  }, [q, members, selectedIds]);

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant/60"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={
              members.length
                ? "Search people (by name or email) to add…"
                : "Add people to the organization first"
            }
            disabled={!members.length}
            className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-2 pr-3 pl-8 text-nb-label outline-none focus:border-nb-primary disabled:opacity-50"
            aria-label="Search people to add"
          />
          {q ? (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface shadow-nb-md">
              {suggestions.length > 0 ? (
                <ul className="py-1">
                  {suggestions.map((m) => (
                    <li key={m.uid}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                        onClick={() => onAdd(m.uid)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <User size={14} className="shrink-0 text-nb-on-surface-variant" />
                          <div className="truncate">
                            {m.displayName ? (
                              <>
                                <span className="font-semibold text-nb-on-surface">
                                  {m.displayName}
                                </span>
                                {m.email && (
                                  <span className="ml-1.5 text-nb-caption text-nb-on-surface-variant">
                                    ({m.email})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-nb-on-surface">{m.email || "Member"}</span>
                            )}
                            {m.status === "alumni" ? (
                              <span className="ml-1.5 text-nb-caption text-nb-on-surface-variant">
                                · Alumni
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 text-nb-caption text-nb-on-surface-variant">
                          Add
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-nb-caption text-nb-on-surface-variant">No matches</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {showSelectedList ? (
        selected.length > 0 ? (
          <div className="max-h-56 divide-y divide-nb-outline-variant/15 overflow-y-auto rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
            {selected.map((m) => (
              <div
                key={m.uid}
                className="flex items-center justify-between gap-3 px-3.5 py-2 text-nb-body"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-nb-primary/10 text-nb-primary">
                    <User size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-nb-label font-medium text-nb-on-surface">
                      {m.displayName || m.email || "Member"}
                      {m.status === "alumni" ? (
                        <span className="ml-1.5 font-normal text-nb-caption text-nb-on-surface-variant">
                          Alumni
                        </span>
                      ) : null}
                    </p>
                    {m.displayName && m.email && (
                      <p className="truncate text-nb-caption text-nb-on-surface-variant">
                        {m.email}
                      </p>
                    )}
                  </div>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-nb-on-surface-variant hover:text-nb-danger"
                    onClick={() => onRemove(m.uid)}
                    title={`Remove ${m.displayName || m.email || "member"}`}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-nb-caption text-nb-on-surface-variant">
            {emptySelectedHint ||
              (canManage
                ? "No one selected yet — search above to add people."
                : "No one selected yet.")}
          </p>
        )
      ) : null}
    </div>
  );
}
