import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PendingChange } from "@/lib/db";

interface PendingChangesPanelProps {
  pendingChanges: PendingChange[];
  isCommitting: boolean;
  onCommit: () => void;
  onDiscard: () => void;
  workspaceMode: string;
}

export default function PendingChangesPanel({
  pendingChanges,
  isCommitting,
  onCommit,
  onDiscard,
  workspaceMode
}: PendingChangesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (workspaceMode !== "github" || (pendingChanges.length === 0 && !isCommitting)) {
    return null;
  }

  const upserted = pendingChanges.filter(p => p.operation === "upsert");
  const deleted = pendingChanges.filter(p => p.operation === "delete");

  return (
    <div className="mb-4">
      <div className="bg-nb-tertiary/5 rounded-xl p-3 border border-nb-tertiary/10 mb-3 space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 flex-1 group cursor-pointer"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-nb-tertiary animate-pulse" />
            <span className="text-[9px] font-black tracking-widest text-nb-tertiary uppercase flex-1 text-left">
              Pending Changes ({pendingChanges.length})
            </span>
            <ChevronDown size={12} className={`text-nb-tertiary transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
          </button>

          {!isCommitting && (
            <button
              onClick={onDiscard}
              className="text-[8px] font-black tracking-widest text-nb-on-surface-variant hover:text-red-500 uppercase transition-colors cursor-pointer"
            >
              Discard
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="max-h-24 overflow-y-auto scrollbar-hide space-y-1.5 pl-4.5 border-l border-nb-tertiary/10 ml-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {pendingChanges.slice(0, 5).map(p => (
              <div key={p.path} className="text-[8px] font-mono text-nb-on-surface-variant/60 truncate flex gap-2">
                <span className={`uppercase font-bold ${p.operation === 'delete' ? 'text-red-500/60' : 'text-nb-tertiary/60'}`}>
                  {p.operation === 'delete' ? 'del' : 'upd'}
                </span>
                <span className="truncate">{p.path.split('/').pop()}</span>
              </div>
            ))}
            {pendingChanges.length > 5 && (
              <div className="text-[8px] italic opacity-40 pl-2">+{pendingChanges.length - 5} more files...</div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onCommit}
        disabled={isCommitting || (upserted.length === 0 && deleted.length === 0)}
        className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[9px] font-bold tracking-widest py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-nb-tertiary/20 disabled:opacity-30 cursor-pointer"
      >
        {isCommitting ? "Syncing..." : "Sync to GitHub"}
      </button>
    </div>
  );
}
