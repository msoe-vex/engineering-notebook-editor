import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Identified, ProjectPhase, DEFAULT_PHASES, sortedPhases } from "./metadata";
export { DEFAULT_PHASES };


export const AVAILABLE_ICONS = [
  "Goal", "Brain", "PencilRuler", "Hammer", "SearchCheck", "Zap", "Lightbulb", "Target",
  "Cpu", "Settings", "Wrench", "Beaker", "Microscope", "FlaskConical", "Clipboard", "ClipboardCheck",
  "CheckCircle", "AlertCircle", "Info", "HelpCircle", "Code", "Terminal", "Box", "Layers",
  "Layout", "MousePointer", "PenTool", "Brush", "Shapes", "Compass", "Map", "Flag",
  "Shield", "Lock", "Key", "User", "Users", "Mail", "Phone", "Camera", "Image", "Video",
  "Activity", "Heart", "Star", "Cloud", "Sun", "Moon", "Wind",
  // Public CMS / social / donors / events
  "Globe", "Link", "Github", "Twitter", "Instagram", "Youtube", "Linkedin", "Facebook",
  "DollarSign", "Handshake", "Award", "Trophy", "Rocket", "Calendar", "MapPin", "Building2",
  "Newspaper", "Megaphone", "Sparkles", "Gift", "Coffee", "Bot",
];

export interface PhaseInfo {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export function getPhases(
  customPhases?: Record<string, ProjectPhase> | Identified<ProjectPhase>[],
  opts?: { includeTrashed?: boolean }
): Identified<ProjectPhase>[] {
  const includeTrashed = Boolean(opts?.includeTrashed);
  const filterActive = (rows: Identified<ProjectPhase>[]) =>
    includeTrashed
      ? rows
      : rows.filter((p) => !(p as ProjectPhase & { deletedAt?: string | null }).deletedAt);
  if (customPhases === undefined) return filterActive(sortedPhases(DEFAULT_PHASES));
  if (Array.isArray(customPhases)) {
    return filterActive([...customPhases]).sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id)
    );
  }
  return filterActive(sortedPhases(customPhases));
}

export function getPhaseConfig(phases: Identified<ProjectPhase>[]): Record<string, PhaseInfo> {
  const config: Record<string, PhaseInfo> = {};
  
  phases.forEach(p => {
    const IconComponent = (Icons as unknown as Record<string, LucideIcon>)[p.iconName] || Icons.HelpCircle;
    
    config[p.id] = {
      icon: IconComponent,
      color: p.color,
      bg: `${p.color}1a`,
      border: `${p.color}33`,
      text: p.color
    };
  });
  
  return config;
}
