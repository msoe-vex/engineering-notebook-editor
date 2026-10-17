"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectPhase } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";

export function PhasePicker({
  phaseId,
  phases,
  disabled,
  onChange,
}: {
  phaseId: string | null | undefined;
  phases?: Record<string, ProjectPhase> | null;
  disabled?: boolean;
  onChange: (phaseId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const phaseList = useMemo(() => (phases ? getPhases(phases) : []), [phases]);
  const phaseConfig = useMemo(() => getPhaseConfig(phaseList), [phaseList]);
  const active = phaseId ? phaseConfig[phaseId] : null;
  const activePhase = phaseId && phases?.[phaseId] ? phases[phaseId] : null;
  const ActiveIcon = active?.icon;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      const menu = document.getElementById("phase-picker-menu");
      if (menu?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle() {
    if (disabled) return;
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 180) });
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex h-9 w-full min-w-[10rem] items-center gap-2 rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2.5 text-left text-nb-label text-nb-on-surface disabled:opacity-50"
      >
        {ActiveIcon && activePhase ? (
          <ActiveIcon size={15} className="shrink-0" style={{ color: activePhase.color }} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {activePhase?.name || "No phase"}
        </span>
        <ChevronDown size={14} className="shrink-0 text-nb-on-surface-variant/60" />
      </button>
      {open &&
        createPortal(
          <div
            id="phase-picker-menu"
            className="max-h-64 overflow-auto rounded-xl border border-nb-outline-variant/30 bg-nb-surface py-1 shadow-nb-lg"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-nb-on-surface-variant hover:bg-nb-surface-low"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1">No phase</span>
              {!phaseId && <Check size={12} className="shrink-0 text-nb-primary" />}
            </button>
            {phaseList.map((p) => {
              const cfg = phaseConfig[p.id];
              const Icon = cfg?.icon;
              const selected = phaseId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-nb-on-surface hover:bg-nb-surface-low"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  {Icon ? <Icon size={14} className="shrink-0" style={{ color: p.color }} /> : null}
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {selected && <Check size={12} className="shrink-0" style={{ color: p.color }} />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
