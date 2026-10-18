"use client";

import type { MutableRefObject } from "react";
import { cn } from "./cn";
import type { MenuItem } from "./menuTypes";

export function MenuList({
  items,
  activeIndex = -1,
  onItemSelect,
  itemRefs,
}: {
  items: MenuItem[];
  activeIndex?: number;
  onItemSelect: (item: MenuItem) => void;
  itemRefs?: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  let actionIndex = -1;

  return (
    <>
      {items.map((item) => {
        if (item.separator) {
          return (
            <div
              key={item.id}
              role="separator"
              className="my-1 border-t border-nb-outline-variant/25"
            />
          );
        }
        actionIndex += 1;
        const idx = actionIndex;
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (itemRefs) itemRefs.current[idx] = el;
            }}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium outline-none",
              item.disabled
                ? "cursor-not-allowed opacity-40"
                : "hover:bg-nb-surface-low",
              item.danger ? "text-nb-danger" : "text-nb-on-surface",
              activeIndex === idx && !item.disabled && "bg-nb-surface-low"
            )}
            onClick={() => {
              if (item.disabled) return;
              onItemSelect(item);
            }}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </>
  );
}

export function actionableMenuItems(items: MenuItem[]): MenuItem[] {
  return items.filter((i) => !i.separator && !i.disabled);
}
