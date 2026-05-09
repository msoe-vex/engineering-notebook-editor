"use client";

import React, { useState, useEffect, useMemo, memo, useCallback } from "react";
import {
  Hash, User, Briefcase, Image as ImageIcon,
  Loader2, Check, X, Camera, Building2, Plus, Trash2, Users,
  Palette, Shapes, Search, GripVertical, LucideIcon
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import Image from "next/image";

import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DraggableAttributes,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TeamMetadata, TeamMember, ProjectPhase } from "@/lib/metadata";
import { DEFAULT_PHASES, AVAILABLE_ICONS } from "@/lib/phases";
import { generateUUID, formatDateMonthYear } from "@/lib/utils";

// ─── Sub-components for performance ──────────────────────────────────────────

const IconPicker = ({
  currentIcon,
  onSelect,
  color
}: {
  currentIcon: string,
  onSelect: (iconName: string) => void,
  color: string
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredIcons = useMemo(() => {
    const q = search.toLowerCase();
    return AVAILABLE_ICONS.filter(i => i.toLowerCase().includes(q));
  }, [search]);

  const IconComp = (LucideIcons as unknown as Record<string, LucideIcon>)[currentIcon] || Shapes;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-11 h-11 rounded-[14px] flex items-center justify-center border-2 transition-all cursor-pointer group hover:scale-105 active:scale-95 shadow-sm"
        style={{ backgroundColor: `${color}15`, color: color, borderColor: `${color}30` }}
        title="Change Icon"
      >
        <IconComp size={20} className="group-hover:rotate-12 transition-transform" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setIsOpen(false)} />
          <div className="absolute top-1/2 left-full ml-4 -translate-y-1/2 w-60 bg-nb-surface border border-nb-outline-variant shadow-nb-2xl rounded-[20px] p-3 z-[200] animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="relative mb-2.5">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="w-full bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg pl-8 pr-2 py-1.5 text-[10px] font-bold text-nb-on-surface focus:outline-none focus:ring-2 focus:ring-nb-primary/20 transition-all"
              />
            </div>
            <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
              {filteredIcons.map(iconName => {
                const PickerIcon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName] || Shapes;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => { onSelect(iconName); setIsOpen(false); }}
                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-all hover:scale-110 cursor-pointer ${currentIcon === iconName ? "bg-nb-primary text-white" : "bg-nb-surface-low border border-nb-outline-variant/20 text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary"}`}
                  >
                    <PickerIcon size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PhaseCard = memo(({
  phase,
  handlePhaseChange,
  removePhase,
  attributes,
  listeners,
  isOverlay = false
}: {
  phase: ProjectPhase,
  handlePhaseChange?: (id: string, field: keyof ProjectPhase, value: string) => void,
  removePhase?: (id: string) => void,
  attributes?: DraggableAttributes,
  listeners?: Record<string, unknown>,
  isOverlay?: boolean
}) => {
  const [localColor, setLocalColor] = useState(phase.color);
  const [prevColor, setPrevColor] = useState(phase.color);
  if (phase.color !== prevColor) {
    setLocalColor(phase.color);
    setPrevColor(phase.color);
  }

  useEffect(() => {
    if (!handlePhaseChange) return;
    const timer = setTimeout(() => {
      if (localColor !== phase.color) {
        handlePhaseChange(phase.id, "color", localColor);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [localColor, phase.id, phase.color, handlePhaseChange]);

  return (
    <div
      className={`flex-1 group flex items-center gap-4 p-3 rounded-2xl bg-nb-surface border border-nb-outline-variant hover:border-nb-primary/30 transition-all ${isOverlay ? 'shadow-nb-2xl border-nb-primary ring-2 ring-nb-primary/10' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-2 -ml-2 rounded-lg text-nb-on-surface-variant/20 hover:text-nb-on-surface-variant/60 hover:bg-nb-surface-low cursor-grab active:cursor-grabbing transition-all shrink-0"
      >
        <GripVertical size={16} />
      </div>

      <IconPicker
        currentIcon={phase.iconName}
        color={localColor}
        onSelect={(name) => handlePhaseChange?.(phase.id, "iconName", name)}
      />

      <div className="relative group/color shrink-0 flex items-center justify-center">
        <input
          type="color"
          value={localColor}
          onChange={e => setLocalColor(e.target.value)}
          className="w-7 h-7 rounded-full border-2 border-white shadow-nb-sm cursor-pointer overflow-hidden p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
        />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <input
          type="text"
          value={phase.name}
          onChange={e => handlePhaseChange?.(phase.id, "name", e.target.value)}
          placeholder="Phase Name"
          className="w-full bg-transparent border-none p-0 text-sm font-bold text-nb-on-surface focus:outline-none placeholder:text-nb-on-surface-variant/30"
        />
        <textarea
          value={phase.description}
          onChange={e => handlePhaseChange?.(phase.id, "description", e.target.value)}
          placeholder="Describe what happens in this phase..."
          rows={1}
          className="w-full bg-transparent border-none p-0 text-[10px] font-medium text-nb-on-surface-variant focus:outline-none placeholder:text-nb-on-surface-variant/20 resize-none h-auto overflow-hidden leading-relaxed"
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => removePhase?.(phase.id)}
        className="p-2 rounded-lg text-nb-on-surface-variant/40 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
        title="Remove Phase"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
});

PhaseCard.displayName = "PhaseCard";
 
 const MemberCard = memo(({
   member,
   handleMemberChange,
   removeMember,
   attributes,
   listeners,
   isOverlay = false
 }: {
   member: TeamMember,
   handleMemberChange?: (id: string, field: keyof TeamMember, value: string) => void,
   removeMember?: (id: string) => void,
   attributes?: DraggableAttributes,
   listeners?: Record<string, unknown>,
   isOverlay?: boolean
 }) => {
   const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
 
     const reader = new FileReader();
     reader.onloadend = () => {
       handleMemberChange?.(member.id, "image", reader.result as string);
     };
     reader.readAsDataURL(file);
   };
 
   return (
     <div
       className={`group flex items-center gap-4 p-5 rounded-[28px] bg-nb-surface border border-nb-outline-variant hover:border-nb-primary/30 hover:shadow-nb-lg transition-all ${isOverlay ? 'shadow-nb-2xl border-nb-primary ring-2 ring-nb-primary/10' : ''}`}
     >
       <div
         {...attributes}
         {...listeners}
         className="p-2 -ml-2 rounded-lg text-nb-on-surface-variant/20 hover:text-nb-on-surface-variant/60 hover:bg-nb-surface-low cursor-grab active:cursor-grabbing transition-all shrink-0"
       >
         <GripVertical size={16} />
       </div>
 
       {/* Member Avatar */}
       <div className="relative">
         <div className="w-20 h-24 rounded-2xl bg-nb-surface-low border-2 border-nb-outline-variant/30 overflow-hidden flex items-center justify-center">
           {member.image ? (
             <div className="relative w-full h-full">
               <Image src={member.image} alt={member.name} fill className="object-cover" unoptimized />
             </div>
           ) : (
             <User size={24} className="text-nb-on-surface-variant/20" />
           )}
         </div>
         <label className="absolute -bottom-1 -right-1 p-2 rounded-xl bg-nb-surface border border-nb-outline-variant shadow-sm text-nb-on-surface-variant hover:text-nb-primary cursor-pointer transition-colors">
           <Camera size={12} />
           <input
             type="file"
             className="hidden"
             accept="image/*"
             onChange={handleImageUpload}
           />
         </label>
       </div>
 
       {/* Member Info */}
       <div className="flex-1 space-y-3">
         <div className="relative">
           <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
           <input
             type="text"
             value={member.name}
             onChange={e => handleMemberChange?.(member.id, "name", e.target.value)}
             placeholder="Name"
             className="w-full bg-nb-surface-low border border-nb-outline-variant/50 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-nb-on-surface focus:outline-none focus:ring-1 focus:ring-nb-primary/30 transition-all"
           />
         </div>
         <div className="relative">
           <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
           <input
             type="text"
             value={member.role}
             onChange={e => handleMemberChange?.(member.id, "role", e.target.value)}
             placeholder="Role"
             className="w-full bg-nb-surface-low border border-nb-outline-variant/50 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-nb-on-surface focus:outline-none focus:ring-1 focus:ring-nb-primary/30 transition-all"
           />
         </div>
       </div>
 
       <button
         onClick={() => removeMember?.(member.id)}
         className="p-3 rounded-xl text-nb-on-surface-variant hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
         title="Remove Member"
       >
         <Trash2 size={18} />
       </button>
     </div>
   );
 });
 
 MemberCard.displayName = "MemberCard";
 
 const MemberRow = memo(({
   member,
   handleMemberChange,
   removeMember
 }: {
   member: TeamMember,
   handleMemberChange: (id: string, field: keyof TeamMember, value: string) => void,
   removeMember: (id: string) => void
 }) => {
   const {
     attributes,
     listeners,
     setNodeRef,
     transform,
     transition,
     isDragging
   } = useSortable({ id: member.id });
 
   const style = {
     transform: CSS.Transform.toString(transform),
     transition: transition || 'transform 150ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms ease',
   };
 
   return (
     <div
       ref={setNodeRef}
       style={style}
       className={`group/row ${isDragging ? 'z-[100]' : ''}`}
     >
       <div className={`transition-all ${isDragging ? 'opacity-0 duration-0' : 'opacity-100 duration-200 delay-150'}`}>
         <MemberCard
           member={member}
           handleMemberChange={handleMemberChange}
           removeMember={removeMember}
           attributes={attributes}
           listeners={listeners}
         />
       </div>
     </div>
   );
 });
 
 MemberRow.displayName = "MemberRow";

const PhaseRow = memo(({
  phase,
  handlePhaseChange,
  removePhase
}: {
  phase: ProjectPhase,
  handlePhaseChange: (id: string, field: keyof ProjectPhase, value: string) => void,
  removePhase: (id: string) => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: phase.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 150ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms ease',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/row ${isDragging ? 'z-[100]' : ''}`}
    >
      <div className={`transition-all ${isDragging ? 'opacity-0 duration-0' : 'opacity-100 duration-200 delay-150'}`}>
        <PhaseCard
          phase={phase}
          handlePhaseChange={handlePhaseChange}
          removePhase={removePhase}
          attributes={attributes}
          listeners={listeners}
        />
      </div>
    </div>
  );
});

PhaseRow.displayName = "PhaseRow";

import { useWorkspace } from "@/hooks/useWorkspace";

interface TeamEditorProps {
  onClose: () => void;
  initialTab?: "identity" | "members" | "phases";
  onTabChange?: (tab: "identity" | "members" | "phases") => void;
}

export default function TeamEditor({
  onClose,
  initialTab = "identity",
  onTabChange
}: TeamEditorProps) {
  const {
    metadata,
    saveTeam
  } = useWorkspace();

  const initialData = useMemo(() => {
    const data = metadata.team || { teamName: "", teamNumber: "", organization: "", logo: "", members: [] };
    return {
      ...data,
      members: data.members.map(m => ({ ...m, id: m.id || generateUUID() }))
    };
  }, [metadata.team]);

  const initialPhases = metadata.phases || DEFAULT_PHASES;

  const [teamData, setTeamData] = useState<TeamMetadata>(initialData);
  const [phases, setPhases] = useState<ProjectPhase[]>(initialPhases);
  const activeTab = initialTab;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const timeline = useMemo(() => {
    const entryDates = Object.values(metadata.entries)
      .map(e => e.date)
      .filter(Boolean)
      .sort();
    return {
      start: formatDateMonthYear(entryDates[0]),
      end: formatDateMonthYear(entryDates[entryDates.length - 1])
    };
  }, [metadata.entries]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasChanges) {
        setIsSaving(true);
        saveTeam(teamData, phases).then(() => {
          setSaveSuccess(true);
          setHasChanges(false);
          setIsSaving(false);
        }).catch(() => setIsSaving(false));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [teamData, phases, hasChanges, saveTeam]);

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  const handleFieldChange = (field: keyof TeamMetadata, value: string) => {
    setTeamData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleMemberChange = (id: string, field: keyof TeamMember, value: string) => {
    setTeamData(prev => {
      const index = prev.members.findIndex(m => m.id === id);
      if (index === -1) return prev;
      const newMembers = [...prev.members];
      newMembers[index] = { ...newMembers[index], [field]: value };
      return { ...prev, members: newMembers };
    });
    setHasChanges(true);
  };

  const addMember = () => {
    setTeamData(prev => ({
      ...prev,
      members: [...prev.members, { id: generateUUID(), name: "", role: "", image: "" }]
    }));
    setHasChanges(true);
  };

  const removeMember = (id: string) => {
    setTeamData(prev => ({
      ...prev,
      members: prev.members.filter(m => m.id !== id)
    }));
    setHasChanges(true);
  };

  const handlePhaseChange = useCallback((id: string, field: keyof ProjectPhase, value: string) => {
    setPhases(prev => {
      const index = prev.findIndex(p => p.id === id);
      if (index === -1) return prev;

      // Prevent duplicate names
      if (field === "name" && prev.some((p, i) => i !== index && p.name === value)) {
        return prev;
      }

      const newPhases = [...prev];
      newPhases[index] = { ...newPhases[index], [field]: value };
      return newPhases;
    });
    setHasChanges(true);
  }, []);

  const addPhase = useCallback(() => {
    setPhases(prev => {
      const nextIndex = prev.length + 1;
      return [...prev, {
        id: generateUUID(),
        index: nextIndex,
        name: "New Phase",
        description: "",
        iconName: "Shapes",
        color: "#94a3b8"
      }];
    });
    setHasChanges(true);
  }, []);

  const removePhase = useCallback((id: string) => {
    setPhases(prev => {
      const filtered = prev.filter(p => p.id !== id);
      return filtered.map((p, i) => ({ ...p, index: i + 1 }));
    });
    setHasChanges(true);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      if (activeTab === "phases") {
        setPhases((items) => {
          const oldIndex = items.findIndex(p => p.id === active.id);
          const newIndex = items.findIndex(p => p.id === over.id);
          const moved = arrayMove(items, oldIndex, newIndex);
          // Re-assign indices to match the new order (1-based)
          return moved.map((p, i) => ({ ...p, index: i + 1 }));
        });
      } else if (activeTab === "members") {
        setTeamData(prev => {
          const oldIndex = prev.members.findIndex(m => m.id === active.id);
          const newIndex = prev.members.findIndex(m => m.id === over.id);
          const moved = arrayMove(prev.members, oldIndex, newIndex);
          return { ...prev, members: moved };
        });
      }
      setHasChanges(true);
    }
    setActiveId(null);
  };

  const restoreDefaultPhases = useCallback(() => {
    setPhases(DEFAULT_PHASES.map(p => ({ ...p })));
    setHasChanges(true);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-full bg-nb-bg animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col bg-nb-surface border-b border-nb-outline-variant shadow-nb-sm shrink-0">
        <div className="flex items-center justify-between px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
              <Users size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-nb-on-surface tracking-tight">Project Configuration</h1>
              <p className="text-xs text-nb-on-surface-variant font-medium">Identity, Team, and Design Process</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-2">
              {isSaving || hasChanges ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-primary animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  <span>SAVING...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-on-surface-variant/40">
                  <Check size={12} />
                  <span>SAVED</span>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-nb-outline-variant/30" />

            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nb-surface-mid hover:bg-nb-surface-high text-nb-on-surface font-bold text-xs transition-all border border-nb-outline-variant/20 cursor-pointer"
            >
              <X size={14} />
              Close
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-center pb-4">
          <div className="flex gap-2 p-1 bg-nb-surface-low rounded-2xl border border-nb-outline-variant/20 w-fit">
            <button
              onClick={() => onTabChange?.("identity")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "identity" ? "bg-nb-surface text-nb-primary shadow-sm" : "text-nb-on-surface-variant hover:text-nb-on-surface"}`}
            >
              <Building2 size={14} />
              Identity
            </button>
            <button
              onClick={() => onTabChange?.("members")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "members" ? "bg-nb-surface text-nb-primary shadow-sm" : "text-nb-on-surface-variant hover:text-nb-on-surface"}`}
            >
              <Users size={14} />
              Team
            </button>
            <button
              onClick={() => onTabChange?.("phases")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "phases" ? "bg-nb-surface text-nb-primary shadow-sm" : "text-nb-on-surface-variant hover:text-nb-on-surface"}`}
            >
              <Palette size={14} />
              Phases
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-4xl mx-auto space-y-12 pb-12">

          {activeTab === "identity" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
              {/* Left Column: Info */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">Team Name</label>
                  <div className="relative">
                    <Users size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                    <input
                      type="text"
                      value={teamData.teamName}
                      onChange={e => handleFieldChange("teamName", e.target.value)}
                      placeholder="e.g. Raider Robotics"
                      className="w-full bg-nb-surface border border-nb-outline-variant rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-nb-on-surface focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">Team Number</label>
                  <div className="relative">
                    <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                    <input
                      type="text"
                      value={teamData.teamNumber}
                      onChange={e => handleFieldChange("teamNumber", e.target.value)}
                      placeholder="e.g. 1234A"
                      className="w-full bg-nb-surface border border-nb-outline-variant rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-nb-on-surface focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">Organization</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                    <input
                      type="text"
                      value={teamData.organization}
                      onChange={e => handleFieldChange("organization", e.target.value)}
                      placeholder="e.g. Milwaukee School of Engineering"
                      className="w-full bg-nb-surface border border-nb-outline-variant rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold text-nb-on-surface focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">Project Timeline</label>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-nb-surface-low border border-nb-outline-variant/30 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant/40 mb-1">Start Date</p>
                      <p className="text-sm font-black text-nb-on-surface">{timeline.start}</p>
                    </div>
                    <div className="flex-1 bg-nb-surface-low border border-nb-outline-variant/30 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant/40 mb-1">End Date</p>
                      <p className="text-sm font-black text-nb-on-surface">{timeline.end}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-nb-on-surface-variant/60 italic ml-1 mt-1">Calculated from the earliest and latest entries.</p>
                </div>

              </div>

              {/* Right Column: Logo */}
              <div className="flex flex-col items-center justify-center p-8 rounded-[32px] bg-nb-surface-low border border-nb-outline-variant/30 space-y-6">
                <div className="relative group">
                  <div className="w-48 h-48 rounded-[40px] bg-nb-surface border-4 border-white shadow-nb-lg overflow-hidden flex items-center justify-center">
                    {teamData.logo ? (
                      <div className="relative w-full h-full">
                        <Image src={teamData.logo} alt="Logo" fill className="object-contain" unoptimized />
                      </div>
                    ) : (
                      <ImageIcon size={48} className="text-nb-on-surface-variant/20" />
                    )}
                  </div>
                  <label className="absolute -bottom-2 -right-2 p-4 rounded-2xl bg-nb-primary text-white shadow-lg shadow-nb-primary/30 cursor-pointer hover:scale-105 transition-transform">
                    <Camera size={20} />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, base64 => handleFieldChange("logo", base64))}
                    />
                  </label>
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">Team Logo</h3>
                  <p className="text-[10px] text-nb-on-surface-variant font-medium mt-1">Appears on the cover page</p>
                </div>
                {teamData.logo && (
                  <button
                    onClick={() => handleFieldChange("logo", "")}
                    className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline cursor-pointer"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === "members" && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={teamData.members.map(m => m.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamData.members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        handleMemberChange={handleMemberChange}
                        removeMember={removeMember}
                      />
                    ))}

                    <button
                      onClick={addMember}
                      className="flex flex-col items-center justify-center p-8 rounded-[28px] border-2 border-dashed border-nb-outline-variant/30 text-nb-on-surface-variant hover:border-nb-primary hover:text-nb-primary hover:bg-nb-primary/5 transition-all group cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-nb-outline-variant/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Plus size={20} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest">Add Member</span>
                    </button>
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId && teamData.members.find(m => m.id === activeId) ? (
                    <div className="w-[400px]">
                      <MemberCard
                        member={teamData.members.find(m => m.id === activeId)!}
                        isOverlay
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}

          {activeTab === "phases" && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={phases.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex gap-6">
                    {/* Static Numbers Column */}
                    <div className="flex flex-col gap-3 py-1">
                      {phases.map((_, i) => (
                        <div key={i} className="w-10 h-[74px] flex items-center justify-center">
                          <span className="text-2xl font-black text-nb-on-surface-variant/10 select-none">
                            {i + 1}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Sortable List */}
                    <div className="flex-1 space-y-3">
                      {phases.map((p) => (
                        <PhaseRow
                          key={p.id}
                          phase={p}
                          handlePhaseChange={handlePhaseChange}
                          removePhase={removePhase}
                        />
                      ))}
                    </div>
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="w-[768px]">
                      <PhaseCard
                        phase={phases.find(p => p.id === activeId)!}
                        isOverlay
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <button
                  onClick={addPhase}
                  className="flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-nb-outline-variant/30 text-nb-on-surface-variant hover:border-nb-primary hover:text-nb-primary hover:bg-nb-primary/5 transition-all group cursor-pointer"
                >
                  <Plus size={18} />
                  <span className="text-xs font-black uppercase tracking-widest">Add Phase</span>
                </button>
                <button
                  onClick={restoreDefaultPhases}
                  className="flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-nb-outline-variant/30 text-nb-on-surface-variant hover:border-nb-outline hover:text-nb-on-surface hover:bg-nb-surface-low transition-all group cursor-pointer"
                >
                  <Palette size={18} />
                  <span className="text-xs font-black uppercase tracking-widest">Restore Defaults</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
