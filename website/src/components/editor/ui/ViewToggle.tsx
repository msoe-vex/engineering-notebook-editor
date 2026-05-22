export type ViewMode = "editor" | "split" | "preview";

interface ViewToggleProps {
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  isMobile?: boolean;
}

export default function ViewToggle({ viewMode, onSetViewMode, isMobile }: ViewToggleProps) {
  return (
    <div className={`flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30 ${!isMobile ? 'mr-2 shadow-sm' : ''}`}>
      <button
        onClick={() => onSetViewMode("editor")}
        className={`px-2 ${isMobile ? 'py-1' : 'py-1'} rounded-md text-[8px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer ${viewMode === "editor" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'
          }`}
      >
        Editor
      </button>
      {!isMobile && (
        <button
          onClick={() => onSetViewMode("split")}
          className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer ${viewMode === "split" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'
            }`}
        >
          Split
        </button>
      )}
      <button
        onClick={() => onSetViewMode("preview")}
        className={`px-2 ${isMobile ? 'py-1' : 'py-1'} rounded-md text-[8px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer ${viewMode === "preview" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'
          }`}
      >
        LaTeX
      </button>
    </div>
  );
}
