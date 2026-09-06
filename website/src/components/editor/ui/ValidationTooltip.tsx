"use client";

import React, { useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";

interface ValidationTooltipProps {
  errors: string[];
  size?: number;
  className?: string;
  iconContainerClassName?: string;
  position?: "left" | "right" | "bottom";
}

export default function ValidationTooltip({
  errors,
  size = 12,
  className = "",
  iconContainerClassName = "",
  position: preferredPosition = "left",
}: ValidationTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const rect = trigger.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const padding = 12;
    const gap = 8;

    let top = 0;
    let left = 0;

    if (preferredPosition === "left") {
      top = rect.top;
      left = rect.left - tip.width - gap;
    } else if (preferredPosition === "right") {
      top = rect.top;
      left = rect.right + gap;
    } else {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tip.width / 2;
    }

    if (left < padding) left = padding;
    if (left + tip.width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - tip.width - padding);
    }

    const fitsBelow = rect.bottom + gap + tip.height <= window.innerHeight - padding;
    const fitsAbove = rect.top - gap - tip.height >= padding;

    if (preferredPosition === "bottom") {
      if (!fitsBelow && fitsAbove) top = rect.top - tip.height - gap;
    } else if (top + tip.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - tip.height - padding);
    }

    if (top < padding) top = padding;

    setCoords({ top, left });
  }, [preferredPosition]);

  useLayoutEffect(() => {
    if (!isHovered || errors.length === 0) {
      setCoords(null);
      return;
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isHovered, updatePosition, errors.length]);

  if (!errors || errors.length === 0) return null;

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`shrink-0 flex items-center justify-center animate-pulse cursor-help ${iconContainerClassName}`}>
        <AlertTriangle size={size} />
      </div>

      {isHovered && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-64 p-4 bg-nb-surface/95 backdrop-blur-xl border border-nb-outline-variant shadow-2xl rounded-2xl pointer-events-none"
          style={{
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            visibility: coords ? "visible" : "hidden",
          }}
        >
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-nb-outline-variant/30">
            <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
              <Info size={12} className="text-amber-500" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant">Validation Issues</span>
          </div>

          <ul className="space-y-2">
            {errors.map((err, i) => (
              <li key={i} className="text-[10px] text-nb-on-surface flex gap-2.5 leading-relaxed">
                <span className="shrink-0 w-1 h-1 rounded-full bg-amber-500 mt-1.5 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span className="font-medium">{err}</span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
