import { Goal, Brain, PencilRuler, Hammer, SearchCheck } from "lucide-react";

export interface PhaseInfo {
  icon: any;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export const PHASE_CONFIG: Record<string, PhaseInfo> = {
  "Define Problem": { icon: Goal, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-600 dark:text-blue-400" },
  "Generate Concepts": { icon: Brain, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-600 dark:text-purple-400" },
  "Develop Solution": { icon: PencilRuler, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-600 dark:text-indigo-400" },
  "Construct and Test": { icon: Hammer, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-600 dark:text-orange-400" },
  "Evaluate Solution": { icon: SearchCheck, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400" },
};

export const PHASES = Object.keys(PHASE_CONFIG);
