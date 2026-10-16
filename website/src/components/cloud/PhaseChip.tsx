"use client";

import type { ProjectPhase } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";

export function PhaseChip({
  phaseId,
  phases,
  size = "sm",
  showLabel = true,
}: {
  phaseId: string | null | undefined;
  phases?: Record<string, ProjectPhase> | null;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  if (!phaseId || !phases?.[phaseId]) return null;
  const list = getPhases(phases);
  const cfg = getPhaseConfig(list)[phaseId];
  const phase = phases[phaseId];
  if (!cfg || !phase) return null;
  const Icon = cfg.icon;
  const iconSize = size === "md" ? 14 : 12;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md font-semibold ${
        size === "md" ? "px-2 py-0.5 text-nb-caption" : "px-1.5 py-0.5 text-[10px]"
      }`}
      style={{ backgroundColor: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
      title={phase.name}
    >
      <Icon size={iconSize} className="shrink-0" />
      {showLabel && <span className="truncate">{phase.name}</span>}
    </span>
  );
}

export function PhaseSelectOptionLabel({
  phaseId,
  phases,
}: {
  phaseId: string;
  phases?: Record<string, ProjectPhase> | null;
}) {
  const phase = phases?.[phaseId];
  if (!phase) return phaseId;
  return phase.name || phaseId;
}
