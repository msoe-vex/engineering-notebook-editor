"use client";

import { useRef } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./cn";

export function ImageField({
  previewUrl,
  busy,
  disabled,
  onUpload,
  onRemove,
  uploadLabel,
  replaceLabel = "Replace",
  removeLabel = "Remove",
  emptyLabel = "No image",
  className,
  size = "md",
}: {
  previewUrl?: string | null;
  busy?: boolean;
  disabled?: boolean;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  uploadLabel?: string;
  replaceLabel?: string;
  removeLabel?: string;
  emptyLabel?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const box =
    size === "sm" ? "h-12 w-12" : size === "lg" ? "h-20 w-20" : "h-16 w-16";

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className={cn(box, "rounded-nb-lg object-cover ring-1 ring-nb-outline-variant/40")}
        />
      ) : (
        <div
          className={cn(
            box,
            "flex items-center justify-center rounded-nb-lg bg-nb-surface-low text-nb-caption font-semibold text-nb-on-surface-variant ring-1 ring-nb-outline-variant/30"
          )}
        >
          {emptyLabel}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={14} /> {previewUrl ? replaceLabel : uploadLabel || "Upload"}
        </Button>
        {previewUrl && onRemove ? (
          <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={onRemove}>
            <Trash2 size={14} /> {removeLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
