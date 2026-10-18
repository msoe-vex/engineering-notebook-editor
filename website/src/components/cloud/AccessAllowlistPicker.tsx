"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { MemberSummary, TeamSummary } from "@/lib/cloud/api";

type Props = {
  teams: TeamSummary[];
  people: MemberSummary[];
  teamIds: string[];
  userIds: string[];
  onTeamIdsChange: (ids: string[]) => void;
  onUserIdsChange: (ids: string[]) => void;
};

/**
 * Restricted-access allowlist: search to add, pills to remove.
 * Prefer this over long checkbox lists (Share sheet + Settings).
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
          ((p.email || "").toLowerCase().includes(q) || p.uid.toLowerCase().includes(q))
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
          placeholder="Search people or teams to add"
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
                      className="flex w-full items-center px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                      onClick={() => {
                        onTeamIdsChange([...teamIds, t.id]);
                        setQuery("");
                      }}
                    >
                      <span className="mr-2 text-nb-caption text-nb-on-surface-variant">Team</span>
                      {t.name}
                    </button>
                  </li>
                ))}
                {suggestions.people.map((p) => (
                  <li key={`u-${p.uid}`}>
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                      onClick={() => {
                        onUserIdsChange([...userIds, p.uid]);
                        setQuery("");
                      }}
                    >
                      <span className="mr-2 text-nb-caption text-nb-on-surface-variant">Person</span>
                      {p.email || p.uid}
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

      {(selectedTeams.length > 0 || selectedPeople.length > 0) ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-0.5 text-[11px] font-medium"
              onClick={() => onTeamIdsChange(teamIds.filter((id) => id !== t.id))}
            >
              Team: {t.name}
              <X size={12} />
            </button>
          ))}
          {selectedPeople.map((p) => (
            <button
              key={p.uid}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-0.5 text-[11px] font-medium"
              onClick={() => onUserIdsChange(userIds.filter((id) => id !== p.uid))}
            >
              {p.email || p.uid}
              <X size={12} />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-nb-caption text-nb-on-surface-variant">
          No one selected yet — search to grant access. Owners and admins always have access.
        </p>
      )}
    </div>
  );
}
