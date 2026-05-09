"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Book,
  Settings,
  GitBranch,
  HardDrive,
  X,
  FileText,
  Layers,
  Target,
  Lightbulb,
  Loader2
} from "lucide-react";

interface HelpPageProps {
  path: string;
  onClose: () => void;
  navigateTo: (params: Record<string, string | null>, pathname?: string) => void;
}

export default function HelpPage({ path, onClose, navigateTo }: HelpPageProps) {
  const segments = path.split('/');
  const lastSegment = segments[segments.length - 1];
  const isWorkspaceHelp = path.startsWith('/workspace/help');
  const baseHelpPath = isWorkspaceHelp ? '/workspace/help' : '/help';

  // Determine active tab from path or default
  const validTabs = ['modes', 'local', 'github', 'editor', 'data', 'phases', 'tips'];
  const activeTab = validTabs.includes(lastSegment) ? lastSegment : (isWorkspaceHelp ? 'editor' : 'modes');

  const [markdownContent, setMarkdownContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const setActiveTab = (tab: string) => {
    navigateTo({}, `${baseHelpPath}/${tab}`);
  };

  useEffect(() => {
    setIsLoading(true);
    fetch(`/content/help/${activeTab}.md`)
      .then(res => res.text())
      .then(text => {
        setMarkdownContent(text);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setMarkdownContent("# Error\nFailed to load help content. Please check your connection.");
        setIsLoading(false);
      });
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-[600] bg-nb-bg flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="h-20 border-b border-nb-outline-variant/30 flex items-center justify-between px-8 bg-nb-surface/50 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
            <Book size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-nb-on-surface">Help Center</h1>
            <p className="text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant/40 uppercase">
              {isWorkspaceHelp ? "Workspace & Editor Guide" : "General Setup & Modes"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 hover:bg-nb-surface-mid rounded-xl text-nb-on-surface-variant hover:text-nb-on-surface transition-all active:scale-95 cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav */}
        <div className="w-64 border-r border-nb-outline-variant/30 p-6 flex flex-col gap-2 bg-nb-surface/20">
          <div className="px-4 py-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant/40">Setup</h3>
          </div>
          <NavButton active={activeTab === 'modes'} onClick={() => setActiveTab('modes')} icon={<Settings size={16} />} label="Workspace Modes" />
          <NavButton active={activeTab === 'local'} onClick={() => setActiveTab('local')} icon={<HardDrive size={16} />} label="Local Setup" />
          <NavButton active={activeTab === 'github'} onClick={() => setActiveTab('github')} icon={<GitBranch size={16} />} label="GitHub Setup" />

          <div className="px-4 py-2 mt-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant/40">Using the Editor</h3>
          </div>
          <NavButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<FileText size={16} />} label="Editor Guide" />
          <NavButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Layers size={16} />} label="Import / Export" />
          <NavButton active={activeTab === 'phases'} onClick={() => setActiveTab('phases')} icon={<Target size={16} />} label="Design Process" />
          <NavButton active={activeTab === 'tips'} onClick={() => setActiveTab('tips')} icon={<Lightbulb size={16} />} label="Notebook Tips" />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-nb-bg/50 custom-scrollbar">
          <div className="max-w-4xl mx-auto p-12 pb-32">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 animate-in fade-in duration-500">
                <Loader2 className="w-8 h-8 text-nb-primary animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant/40">Loading content...</span>
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-4xl font-black tracking-tight text-nb-on-surface mb-8">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-2xl font-bold text-nb-on-surface mt-12 mb-4 flex items-center gap-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-bold text-nb-on-surface mt-8 mb-3">{children}</h3>,
                    p: ({ children }) => <p className="text-nb-on-surface-variant leading-relaxed mb-4">{children}</p>,
                    ul: ({ children }) => <ul className="space-y-3 mb-6 ml-4">{children}</ul>,
                    ol: ({ children }) => <ol className="space-y-4 mb-6 ml-4 list-decimal">{children}</ol>,
                    li: ({ children }) => (
                      <li className="text-nb-on-surface-variant flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-nb-primary mt-2 shrink-0" />
                        <span>{children}</span>
                      </li>
                    ),
                    code: ({ children }) => <code className="bg-nb-surface-mid px-1.5 py-0.5 rounded text-nb-primary font-mono text-sm border border-nb-outline-variant/30">{children}</code>,
                    blockquote: ({ children }) => (
                      <div className="p-6 bg-nb-primary/5 border-l-4 border-nb-primary rounded-r-2xl my-8 italic text-nb-on-surface leading-relaxed">
                        {children}
                      </div>
                    ),
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-nb-primary font-bold hover:underline decoration-2 underline-offset-4">
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => <strong className="font-black text-nb-on-surface">{children}</strong>,
                    hr: () => <hr className="my-12 border-nb-outline-variant/30" />,
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${active
        ? "bg-nb-primary text-white shadow-lg shadow-nb-primary/20"
        : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface"
        }`}
    >
      <div className={active ? "text-white" : "text-nb-primary"}>{icon}</div>
      {label}
    </button>
  );
}
