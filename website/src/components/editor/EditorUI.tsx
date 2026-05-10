import React, { useState } from "react";

export const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title
}: {
  onClick: (e?: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string
}) => (
  <button
    type="button"
    onClick={(e) => !disabled && onClick(e)}
    disabled={disabled}
    title={title}
    className={`p-2 rounded-lg transition-all flex items-center justify-center border cursor-pointer ${active
      ? "bg-nb-primary text-white shadow-md border-nb-primary scale-105"
      : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface border-transparent"
      } ${disabled ? "opacity-30 cursor-not-allowed grayscale" : ""}`}
  >
    {children}
  </button>
);

export const TableGridSelector = ({ onSelect, initialRows = 0, initialCols = 0 }: { onSelect: (rows: number, cols: number) => void, initialRows?: number, initialCols?: number }) => {
  const [hovered, setHovered] = useState({ r: initialRows, c: initialCols });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const colWidth = rect.width / 10;
    const rowHeight = rect.height / 10;
    
    const c = Math.min(10, Math.max(1, Math.ceil(x / colWidth)));
    const r = Math.min(10, Math.max(1, Math.ceil(y / rowHeight)));
    
    if (r !== hovered.r || c !== hovered.c) {
      setHovered({ r, c });
    }
  };

  return (
    <div className="p-3 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl w-max animate-in fade-in zoom-in-95 duration-200">
      <div 
        className="grid grid-cols-10 w-[160px] h-[160px] relative cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered({ r: initialRows, c: initialCols })}
        onClick={() => onSelect(hovered.r, hovered.c)}
      >
        {Array.from({ length: 10 }).map((_, r) => (
          Array.from({ length: 10 }).map((_, c) => (
            <div
              key={`${r}-${c}`}
              className="flex items-center justify-center w-full h-full"
            >
              <div
                className={`w-[85%] h-[85%] rounded-[1px] border transition-all duration-75 ${r < hovered.r && c < hovered.c
                  ? "bg-nb-primary border-nb-primary shadow-[0_0_8px_rgba(var(--nb-primary-rgb),0.4)]"
                  : "bg-nb-surface-low border-nb-outline-variant/20"
                  }`}
              />
            </div>
          ))
        ))}
      </div>
      <div className="mt-3 text-[10px] font-black tracking-widest text-nb-on-surface-variant text-center bg-nb-surface-low py-1.5 rounded-lg border border-nb-outline-variant/10">
        {hovered.r > 0 ? `${hovered.r} × ${hovered.c}` : "SELECT SIZE"}
      </div>
    </div>
  );
};
