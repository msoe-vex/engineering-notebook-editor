"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { hasGenAIApiKey } from "@/lib/genai";
import { events, EventNames } from "@/lib/events";

interface GenerateButtonProps {
  label: string;
  run: () => Promise<string>;
  onResult: (value: string) => void;
  disabled?: boolean;
}

export default function GenerateButton({ label, run, onResult, disabled }: GenerateButtonProps) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      title={label}
      disabled={disabled || busy}
      onMouseDown={(e) => e.preventDefault()}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy || disabled) return;
        if (!hasGenAIApiKey()) {
          events.emit(EventNames.SHOW_NOTIFICATION, {
            message: "Add an AI provider API key in Settings to generate titles and captions.",
            type: "error",
          });
          return;
        }
        setBusy(true);
        try {
          onResult(await run());
        } catch (err) {
          events.emit(EventNames.SHOW_NOTIFICATION, {
            message: err instanceof Error ? err.message : "Generation failed.",
            type: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
      className="shrink-0 p-1 rounded-md text-nb-on-surface-variant hover:text-nb-primary hover:bg-nb-surface-low disabled:opacity-40 cursor-pointer"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
    </button>
  );
}
