import * as Icons from "lucide-react";
import { ProjectPhase } from "./metadata";

export const DEFAULT_PHASES: ProjectPhase[] = [
  { id: "1", name: "Define Problem", iconName: "Goal", color: "#3b82f6" },
  { id: "2", name: "Generate Concepts", iconName: "Brain", color: "#a855f7" },
  { id: "3", name: "Develop Solution", iconName: "PencilRuler", color: "#6366f1" },
  { id: "4", name: "Construct and Test", iconName: "Hammer", color: "#f97316" },
  { id: "5", name: "Evaluate Solution", iconName: "SearchCheck", color: "#10b981" },
];

export const AVAILABLE_ICONS = [
  "Goal", "Brain", "PencilRuler", "Hammer", "SearchCheck", "Zap", "Lightbulb", "Target", 
  "Cpu", "Settings", "Wrench", "Beaker", "Microscope", "FlaskConical", "Clipboard", "ClipboardCheck",
  "CheckCircle", "AlertCircle", "Info", "HelpCircle", "Code", "Terminal", "Box", "Layers",
  "Layout", "MousePointer", "PenTool", "Brush", "Shapes", "Compass", "Map", "Flag",
  "Shield", "Lock", "Key", "User", "Users", "Mail", "Phone", "Camera", "ImageIcon", "Video",
  "Activity", "Heart", "Star", "Cloud", "Sun", "Moon", "Wind"
];

export interface PhaseInfo {
  icon: any;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export function getPhases(customPhases?: ProjectPhase[]): ProjectPhase[] {
  if (!customPhases || customPhases.length === 0) return DEFAULT_PHASES;
  return customPhases;
}

/**
 * Returns a Record<string, PhaseInfo> for the given phases.
 * In a real React app, you'd probably use a hook for this if it depends on metadata.
 */
export function getPhaseConfig(phases: ProjectPhase[]): Record<string, PhaseInfo> {
  const config: Record<string, PhaseInfo> = {};
  
  phases.forEach(p => {
    // Dynamically get icon component
    const IconComponent = (Icons as any)[p.iconName] || Icons.HelpCircle;
    
    // We need to convert hex to Tailwind-like rgba for bg/border if possible, 
    // but for now we'll just use inline styles or standard mappings.
    // To keep it simple and premium, we'll generate some semi-transparent versions of the hex.
    const hex = p.color;
    
    config[p.name] = {
      icon: IconComponent,
      color: `text-[${hex}]`, // This might not work with JIT if not Safelisted
      bg: `bg-[${hex}]/10`,
      border: `border-[${hex}]/20`,
      text: `text-[${hex}]`
    };
  });
  
  return config;
}
