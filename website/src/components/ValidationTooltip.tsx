"use client";

import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';

interface ValidationTooltipProps {
  errors: string[];
  size?: number;
  className?: string;
  iconContainerClassName?: string;
  position?: 'left' | 'right' | 'bottom';
}

export default function ValidationTooltip({
  errors,
  size = 12,
  className = "",
  iconContainerClassName = "",
  position: preferredPosition = 'left'
}: ValidationTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 256;
    const tooltipHeight = 160;

    let top = 0;
    let left = 0;
    const padding = 12;

    // Initial placement based on preference
    if (preferredPosition === 'left') {
      top = rect.top;
      left = rect.left - tooltipWidth - 8;
    } else if (preferredPosition === 'right') {
      top = rect.top;
      left = rect.right + 8;
    } else {
      // Default: bottom
      top = rect.bottom + 8;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }

    // Viewport constraints adjustment
    if (left < padding) left = padding;
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }

    if (top < padding) top = padding;
    if (top + tooltipHeight > window.innerHeight - padding) {
      top = rect.top - tooltipHeight - 8;
      if (top < padding) top = rect.bottom + 8;
    }

    setPosition({ top, left });
    setIsReady(true);
  }, [preferredPosition]);

  // We use useLayoutEffect to position it before the browser paints
  useLayoutEffect(() => {
    if (isHovered && errors.length > 0) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isHovered, updatePosition, errors.length]);

  if (!errors || errors.length === 0) return null;

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsReady(false);
      }}
    >
      <div className={`shrink-0 flex items-center justify-center animate-pulse cursor-help ${iconContainerClassName}`}>
        <AlertTriangle size={size} />
      </div>

      {isHovered && isReady && typeof document !== 'undefined' && createPortal(
        <div
          className={`fixed z-[9999] w-64 p-4 bg-nb-surface/95 backdrop-blur-xl border border-nb-outline-variant shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 duration-200 pointer-events-none`}
          style={{ top: position.top, left: position.left }}
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
