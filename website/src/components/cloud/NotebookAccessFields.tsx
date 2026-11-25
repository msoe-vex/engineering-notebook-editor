"use client";

import { Button } from "@/components/ui";
import type { MemberSummary, TeamSummary } from "@/lib/cloud/api";
import { AccessAllowlistPicker } from "./AccessAllowlistPicker";

export type NotebookAccessFieldsProps = {
  accessMode: "org" | "restricted";
  onAccessModeChange: (mode: "org" | "restricted") => void;
  teams: TeamSummary[];
  people: MemberSummary[];
  teamIds: string[];
  userIds: string[];
  onTeamIdsChange: (ids: string[]) => void;
  onUserIdsChange: (ids: string[]) => void;
  /** Optional short intro; default explains org vs restricted. */
  description?: string;
  disabled?: boolean;
};

/**
 * Shared org-open vs restricted controls for Share, Create, and Setup Access.
 * Public PDF share links stay on Compile — not this ACL surface.
 */
export function NotebookAccessFields({
  accessMode,
  onAccessModeChange,
  teams,
  people,
  teamIds,
  userIds,
  onTeamIdsChange,
  onUserIdsChange,
  description = "Organization owners and admins can always open every notebook. Choose who else can open this one.",
  disabled,
}: NotebookAccessFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {description ? (
        <p className="text-nb-body text-nb-on-surface-variant">{description}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={accessMode === "org" ? "primary" : "secondary"}
          onClick={() => onAccessModeChange("org")}
          disabled={disabled}
        >
          Entire organization
        </Button>
        <Button
          size="sm"
          variant={accessMode === "restricted" ? "primary" : "secondary"}
          onClick={() => onAccessModeChange("restricted")}
          disabled={disabled}
        >
          Restricted
        </Button>
      </div>

      {accessMode === "restricted" && (
        <AccessAllowlistPicker
          teams={teams}
          people={people}
          teamIds={teamIds}
          userIds={userIds}
          onTeamIdsChange={onTeamIdsChange}
          onUserIdsChange={onUserIdsChange}
        />
      )}
    </div>
  );
}
