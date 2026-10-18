"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { actionableMenuItems, MenuList } from "./MenuList";
import type { MenuItem } from "./menuTypes";
import { cn } from "./cn";

const MENU_PAD = 8;

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  className,
}: {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  className?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState({ top: y, left: x });
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useLayoutEffect(() => {
    if (!open) return;
    setPos({ top: y, left: x });
    setActiveIndex(0);
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let top = y;
    let left = x;
    if (top + rect.height > window.innerHeight - MENU_PAD) {
      top = Math.max(MENU_PAD, window.innerHeight - rect.height - MENU_PAD);
    }
    if (left + rect.width > window.innerWidth - MENU_PAD) {
      left = Math.max(MENU_PAD, window.innerWidth - rect.width - MENU_PAD);
    }
    setPos({ top, left });
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const actions = actionableMenuItems(itemsRef.current);
      if (!actions.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % actions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + actions.length) % actions.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const item = actions[activeIndexRef.current];
        if (item?.onSelect) {
          onClose();
          item.onSelect();
        }
      }
    };
    // Defer so the opening contextmenu event does not immediately close.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("contextmenu", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("contextmenu", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className={cn(
        "fixed z-[100] min-w-44 overflow-hidden rounded-xl border border-nb-outline-variant/30 bg-nb-surface py-1 shadow-nb-lg",
        className
      )}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <MenuList
        items={items}
        activeIndex={activeIndex}
        itemRefs={itemRefs}
        onItemSelect={(item) => {
          onClose();
          item.onSelect?.();
        }}
      />
    </div>,
    document.body
  );
}
