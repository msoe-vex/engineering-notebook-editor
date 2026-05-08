import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";
import { ProjectPhase } from "./metadata";

export const DEFAULT_PHASES: ProjectPhase[] = [
  { id: "define-problem", index: 1, name: "Define Problem", description: "Identifying the core issue, setting SMART goals, outlining constraints and deliverables.", iconName: "Goal", color: "#3b82f6" },
  { id: "generate-concepts", index: 2, name: "Generate Concepts", description: "Brainstorming, research, prototyping, and decision matrices to evaluate potential solutions.", iconName: "Brain", color: "#a855f7" },
  { id: "develop-solution", index: 3, name: "Develop Solution", description: "Creating CAD, detailed sketches, math calculations, graphical models, and pseudocode.", iconName: "PencilRuler", color: "#6366f1" },
  { id: "construct-test", index: 4, name: "Construct and Test", description: "Building the robot, writing the code, executing test plans, and gathering qualitative/quantitative data.", iconName: "Hammer", color: "#f97316" },
  { id: "evaluate-solution", index: 5, name: "Evaluate Solution", description: "Reflecting on constraints, event outcomes, and planning future improvements.", iconName: "SearchCheck", color: "#10b981" },
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
