"use client";

import React, { useState, useEffect } from "react";
import {
  Hash, User, Briefcase, Image as ImageIcon,
  Loader2, Check, X, Camera, Building2, Plus, Trash2, Users
} from "lucide-react";
import Image from "next/image";
import { TeamMetadata, TeamMember } from "@/lib/metadata";

interface TeamEditorProps {
  initialData: TeamMetadata;
  onSave: (data: TeamMetadata) => Promise<void>;
  onClose: () => void;
  isSaving?: boolean;
}

export default function TeamEditor({
  initialData,
  onSave,
  onClose,
  isSaving = false
}: TeamEditorProps) {
  const [teamData, setTeamData] = useState<TeamMetadata>(initialData);
  const [activeTab, setActiveTab] = useState<"identity" | "members">("identity");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasChanges) {
        onSave(teamData).then(() => {
          setSaveSuccess(true);
          setHasChanges(false);
        });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [teamData, hasChanges, onSave]);

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

  const handleMemberChange = (index: number, field: keyof TeamMember, value: string) => {
    const newMembers = [...teamData.members];
    newMembers[index] = { ...newMembers[index], [field]: value };
    setTeamData(prev => ({ ...prev, members: newMembers }));
    setHasChanges(true);
  };

  const addMember = () => {
    setTeamData(prev => ({
      ...prev,
      members: [...prev.members, { name: "", role: "", image: "" }]
    }));
    setHasChanges(true);
  };

  const removeMember = (index: number) => {
    setTeamData(prev => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== index)
    }));
    setHasChanges(true);
  };

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
      <div className="flex items-center justify-between px-8 py-6 bg-nb-surface border-b border-nb-outline-variant shadow-nb-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-nb-on-surface tracking-tight">Team Configuration</h1>
            <p className="text-xs text-nb-on-surface-variant font-medium">Manage your team identity and gallery</p>
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* Navigation Tabs */}
          <div className="flex gap-2 p-1 bg-nb-surface-low rounded-2xl border border-nb-outline-variant/20 w-fit">
            <button
              onClick={() => setActiveTab("identity")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "identity" ? "bg-nb-surface text-nb-primary shadow-sm" : "text-nb-on-surface-variant hover:text-nb-on-surface"}`}
            >
              <Building2 size={14} />
              Team Details
            </button>
            <button
              onClick={() => setActiveTab("members")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === "members" ? "bg-nb-surface text-nb-primary shadow-sm" : "text-nb-on-surface-variant hover:text-nb-on-surface"}`}
            >
              <Users size={14} />
              Members
            </button>
          </div>

          {activeTab === "identity" ? (
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
          ) : (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teamData.members.map((member, index) => (
                  <div
                    key={index}
                    className="group flex items-center gap-4 p-5 rounded-[28px] bg-nb-surface border border-nb-outline-variant hover:border-nb-primary/30 hover:shadow-nb-lg transition-all"
                  >
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
                          onChange={e => handleImageUpload(e, base64 => handleMemberChange(index, "image", base64))}
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
                          onChange={e => handleMemberChange(index, "name", e.target.value)}
                          placeholder="Name"
                          className="w-full bg-nb-surface-low border border-nb-outline-variant/50 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-nb-on-surface focus:outline-none focus:ring-1 focus:ring-nb-primary/30 transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                        <input
                          type="text"
                          value={member.role}
                          onChange={e => handleMemberChange(index, "role", e.target.value)}
                          placeholder="Role"
                          className="w-full bg-nb-surface-low border border-nb-outline-variant/50 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-nb-on-surface focus:outline-none focus:ring-1 focus:ring-nb-primary/30 transition-all"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => removeMember(index)}
                      className="p-3 rounded-xl text-nb-on-surface-variant hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
