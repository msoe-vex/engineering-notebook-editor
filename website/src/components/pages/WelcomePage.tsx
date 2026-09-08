"use client";

import { useMemo, useState } from "react";
import { Plus, ChevronDown, FileText, Layers, HardDrive, ArrowLeftRight } from "lucide-react";
import GithubIcon from "@/components/icons/GithubIcon";
import Logo from "@/components/icons/Logo";
import { useWorkspace } from "@/hooks/useWorkspace";
import { sortedEntries } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";
import { showNotification } from "@/components/overlays/Notification";

interface WorkspaceInfo {
  mode: "github" | "local" | "temporary";
  label: string;
}

interface WelcomePageProps {
  workspace: WorkspaceInfo;
  onNewEntry: () => void;
  onDisconnect: () => void;
  onOpenSidebar: () => void;
}

export default function WelcomePage({ workspace, onNewEntry, onDisconnect, onOpenSidebar }: WelcomePageProps) {
  const { metadata, createEntryFromTemplate, navigateTo } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);

  const templates = useMemo(
    () => sortedEntries(metadata.entries).filter((e) => e.isTemplate),
    [metadata.entries]
  );
  const phases = getPhases(metadata.phases);
  const phaseConfig = getPhaseConfig(phases);

  const ModeIcon =
    workspace.mode === "github" ? GithubIcon :
      workspace.mode === "local" ? HardDrive : ArrowLeftRight;

  const handleFromTemplate = async (templateId: string) => {
    setMenuOpen(false);
    try {
      const newId = await createEntryFromTemplate(templateId);
      if (newId) navigateTo({ entry: newId, resource: null }, "/workspace/editor");
      showNotification("Created new entry from template.", "success");
    } catch (e) {
      console.error(e);
      showNotification("Failed to create entry from template.", "error");
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-nb-bg px-6 py-12">
      <div className="m-auto w-full max-w-2xl flex flex-col items-center">
        <div className="flex flex-col items-center gap-6 mb-12">
          <button
            onClick={onDisconnect}
            className="w-20 h-20 rounded-2xl bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30 hover:scale-105 transition-transform cursor-pointer group"
            title="Go to Home"
          >
            <Logo className="text-white group-hover:rotate-12 transition-transform" size={48} strokeWidth={18} />
          </button>
          <div className="text-center">
            <h1 className="text-4xl font-bold text-nb-on-surface">
              ENGen
            </h1>
            <div className="flex items-center gap-2 justify-center mt-3 text-sm text-nb-on-surface-variant">
              <ModeIcon size={14} className="text-nb-tertiary" />
              <span className="tracking-tight">{workspace.label}</span>
            </div>
          </div>
        </div>

        <div className="relative w-full max-w-md">
          <button
            id="welcome-new-entry"
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-4 bg-nb-surface hover:bg-nb-surface-low border border-nb-outline-variant p-5 rounded-3xl text-left font-bold shadow-nb-lg transition-all active:scale-[0.98] group cursor-pointer w-full"
          >
            <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0 group-hover:bg-nb-primary/20 transition-colors">
              <Plus size={20} className="text-nb-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[10px] tracking-[0.2em] uppercase opacity-70">New Entry</div>
              <div className="text-nb-on-surface text-base font-bold mt-0.5 leading-tight">Start a fresh entry</div>
            </div>
            <ChevronDown size={18} className={`text-nb-on-surface-variant/50 shrink-0 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-nb-xl py-1.5 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-80">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onNewEntry();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer text-left shrink-0"
                >
                  <FileText size={16} className="text-nb-primary shrink-0" />
                  Blank entry
                </button>
                <div className="px-4 py-1.5 text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50 border-t border-nb-outline-variant/20 mt-1 shrink-0">
                  From template
                </div>
                <div className="overflow-y-auto min-h-0 custom-scrollbar">
                  {templates.length > 0 ? (
                    templates.map((tmpl) => {
                      const pConfig = tmpl.phase ? phaseConfig[tmpl.phase] : null;
                      const TmplIcon = pConfig ? pConfig.icon : Layers;
                      const color = tmpl.phase ? phases.find((p) => p.id === tmpl.phase)?.color : "#9333ea";
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => handleFromTemplate(tmpl.id)}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-nb-on-surface hover:bg-nb-surface-low hover:text-nb-primary transition-colors cursor-pointer text-left"
                        >
                          <TmplIcon size={15} style={{ color }} className="shrink-0" />
                          <span className="truncate">{tmpl.title || "Untitled Template"}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-2 text-xs text-nb-on-surface-variant/60 italic">
                      No templates yet
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="mt-8 max-w-md text-center text-sm text-nb-on-surface-variant leading-relaxed">
          Open existing entries from the{" "}
          <button type="button" onClick={onOpenSidebar} className="font-bold text-nb-on-surface hover:text-nb-primary cursor-pointer">
            sidebar
          </button>
          . Compile, team, calendar, import/export, help, and settings are in the{" "}
          <span className="font-bold text-nb-on-surface">project menu</span>
          {" "}(the name in the top bar).
        </p>

        <div className="mt-16 text-center">
          <button
            id="welcome-disconnect"
            onClick={onDisconnect}
            className="text-xs font-bold tracking-widest text-nb-on-surface-variant hover:text-nb-primary transition-colors border-b border-transparent hover:border-nb-primary pb-0.5 cursor-pointer"
          >
            Change workspace
          </button>
        </div>
      </div>
    </div>
  );
}
