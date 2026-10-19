"use client";

import { useMemo, useState } from "react";
import { Search, User, Users, X } from "lucide-react";
import type { MemberSummary, TeamSummary } from "@/lib/cloud/api";
import { Button } from "@/components/ui/Button";

type Props = {
  teams: TeamSummary[];
  people: MemberSummary[];
  teamIds: string[];
  userIds: string[];
  onTeamIdsChange: (ids: string[]) => void;
  onUserIdsChange: (ids: string[]) => void;
};

/**
 * Restricted-access allowlist: search to add, vertical list to manage.
 */
export function AccessAllowlistPicker({
  teams,
  people,
  teamIds,
  userIds,
  onTeamIdsChange,
  onUserIdsChange,
}: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const selectedTeams = teams.filter((t) => teamIds.includes(t.id));
  const selectedPeople = people.filter((p) => userIds.includes(p.uid));

  const suggestions = useMemo(() => {
    if (!q) return { teams: [] as TeamSummary[], people: [] as MemberSummary[] };
    return {
      teams: teams.filter(
        (t) => !teamIds.includes(t.id) && t.name.toLowerCase().includes(q)
      ),
      people: people.filter(
        (p) =>
          !userIds.includes(p.uid) &&
          ((p.displayName || "").toLowerCase().includes(q) ||
            (p.email || "").toLowerCase().includes(q) ||
            p.uid.toLowerCase().includes(q))
      ),
    };
  }, [q, teams, people, teamIds, userIds]);

  const hasSuggestions = suggestions.teams.length > 0 || suggestions.people.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant/60"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people (by name or email) or teams to add"
          className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-2 pr-3 pl-8 text-nb-label outline-none focus:border-nb-primary"
          aria-label="Search people or teams"
        />
        {q && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface shadow-nb-md">
            {hasSuggestions ? (
              <ul className="py-1">
                {suggestions.teams.map((t) => (
                  <li key={`t-${t.id}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                      onClick={() => {
                        onTeamIdsChange([...teamIds, t.id]);
                        setQuery("");
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users size={14} className="text-nb-tertiary shrink-0" />
                        <span className="font-semibold text-nb-on-surface truncate">{t.name}</span>
                      </div>
                      <span className="text-nb-caption text-nb-on-surface-variant shrink-0">Team</span>
                    </button>
                  </li>
                ))}
                {suggestions.people.map((p) => (
                  <li key={`u-${p.uid}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                      onClick={() => {
                        onUserIdsChange([...userIds, p.uid]);
                        setQuery("");
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <User size={14} className="text-nb-on-surface-variant shrink-0" />
                        <div className="truncate">
                          {p.displayName ? (
                            <>
                              <span className="font-semibold text-nb-on-surface">{p.displayName}</span>
                              {p.email && (
                                <span className="ml-1.5 text-nb-caption text-nb-on-surface-variant">
                                  ({p.email})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-nb-on-surface">{p.email || p.uid}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-nb-caption text-nb-on-surface-variant shrink-0">Person</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2 text-nb-caption text-nb-on-surface-variant">No matches</p>
            )}
          </div>
        )}
      </div>

      {selectedTeams.length > 0 || selectedPeople.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface divide-y divide-nb-outline-variant/15">
          {selectedTeams.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2 text-nb-body"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-nb-tertiary/10 text-nb-tertiary">
                  <Users size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-nb-on-surface text-nb-label">{t.name}</p>
                  <p className="text-nb-caption text-nb-on-surface-variant">Team</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-nb-on-surface-variant hover:text-nb-danger"
                onClick={() => onTeamIdsChange(teamIds.filter((id) => id !== t.id))}
                title={`Remove team ${t.name}`}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          {selectedPeople.map((p) => (
            <div
              key={p.uid}
              className="flex items-center justify-between gap-3 px-3.5 py-2 text-nb-body"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-nb-primary/10 text-nb-primary">
                  <User size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-nb-on-surface text-nb-label">
                    {p.displayName || p.email || p.uid}
                  </p>
                  {p.displayName && p.email && (
                    <p className="truncate text-nb-caption text-nb-on-surface-variant">{p.email}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-nb-on-surface-variant hover:text-nb-danger"
                onClick={() => onUserIdsChange(userIds.filter((id) => id !== p.uid))}
                title={`Remove ${p.displayName || p.email || p.uid}`}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-nb-caption text-nb-on-surface-variant">
          No one selected yet — search above to grant access. Owners and admins always have access.
        </p>
      )}
    </div>
  );
}
