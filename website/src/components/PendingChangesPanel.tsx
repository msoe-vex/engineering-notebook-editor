import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { PendingChange } from "@/lib/db";
 
interface PendingChangesPanelProps {
  pendingChanges: PendingChange[];
  isCommitting: boolean;
  isDiscarding: boolean;
  onCommit: (message?: string) => void;
  onDiscard: () => void;
  workspaceMode: string;
}
 
export default function PendingChangesPanel({
  pendingChanges,
  isCommitting,
  isDiscarding,
  onCommit,
  onDiscard,
  workspaceMode
}: PendingChangesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
 
  if (workspaceMode !== "github") {
    return null;
  }
 
  const upserted = pendingChanges.filter(p => p.operation === "upsert");
  const deleted = pendingChanges.filter(p => p.operation === "delete");
 
  const handleCommit = () => {
    onCommit(commitMessage);
    // Note: We don't clear commitMessage here because if the commit fails,
    // the user should be able to try again with the same message.
    // If it succeeds, the panel usually unmounts as pendingChanges goes to 0.
  };
 
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
            <ChevronDown size={12} className={`text-nb-tertiary transition-transform ${!isCollapsed ? "" : "rotate-180"}`} />
          </button>
 
          {!isCommitting && (
            <button
              onClick={onDiscard}
              disabled={isDiscarding}
              className="flex items-center gap-1.5 text-[8px] font-black tracking-widest text-nb-on-surface-variant hover:text-red-500 uppercase transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDiscarding ? (
                <>
                  <Loader2 size={10} className="animate-spin-stable" />
                  <span>Discarding...</span>
                </>
              ) : (
                "Discard"
              )}
            </button>
          )}
        </div>
 
        {!isCollapsed && (
          <div className="max-h-24 overflow-y-auto scrollbar-hide space-y-1.5 pl-4.5 border-l border-nb-tertiary/10 ml-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {pendingChanges.map(p => (
              <div key={p.path} className="text-[8px] font-mono text-nb-on-surface-variant/60 truncate flex gap-2">
                <span className={`uppercase font-bold ${p.operation === 'delete' ? 'text-red-500/60' : 'text-nb-tertiary/60'}`}>
                  {p.operation === 'delete' ? 'del' : 'upd'}
                </span>
                <span className="truncate">{p.path.split('/').pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
 
      <div className="mb-3">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message (optional)..."
          disabled={isCommitting || isDiscarding}
          className="w-full bg-nb-surface border border-nb-outline-variant rounded-lg p-2.5 text-[10px] text-nb-on-surface placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-nb-tertiary transition-all resize-none h-16 scrollbar-hide"
        />
      </div>
 
      <button
        onClick={handleCommit}
        disabled={isCommitting || isDiscarding || (upserted.length === 0 && deleted.length === 0)}
        className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[9px] font-bold tracking-widest py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-nb-tertiary/20 disabled:opacity-30 cursor-pointer flex items-center justify-center gap-2"
      >
        {isCommitting ? (
          <>
            <Loader2 size={14} className="animate-spin-stable" />
            <span>Syncing...</span>
          </>
        ) : "Sync to GitHub"}
      </button>
    </div>
  );
}
