import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";
import { ProjectPhase, DEFAULT_PHASES } from "./metadata";
export { DEFAULT_PHASES };


export const AVAILABLE_ICONS = [
  "Goal", "Brain", "PencilRuler", "Hammer", "SearchCheck", "Zap", "Lightbulb", "Target", 
  "Cpu", "Settings", "Wrench", "Beaker", "Microscope", "FlaskConical", "Clipboard", "ClipboardCheck",
  "CheckCircle", "AlertCircle", "Info", "HelpCircle", "Code", "Terminal", "Box", "Layers",
  "Layout", "MousePointer", "PenTool", "Brush", "Shapes", "Compass", "Map", "Flag",
  "Shield", "Lock", "Key", "User", "Users", "Mail", "Phone", "Camera", "ImageIcon", "Video",
  "Activity", "Heart", "Star", "Cloud", "Sun", "Moon", "Wind"
];

export interface PhaseInfo {
  icon: LucideIcon;
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
    const IconComponent = (Icons as unknown as Record<string, LucideIcon>)[p.iconName] || Icons.HelpCircle;
    
    config[p.index] = {
      icon: IconComponent,
      color: p.color,
      bg: `${p.color}1a`, // 10% opacity hex
      border: `${p.color}33`, // 20% opacity hex
      text: p.color
    };
  });
  
  return config;
}
