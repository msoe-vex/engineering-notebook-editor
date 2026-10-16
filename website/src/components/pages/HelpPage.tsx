"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Book,
  Compass,
  Settings,
  HardDrive,
  X,
  FileText,
  Layers,
  Target,
  Lightbulb,
  Loader2,
  ExternalLink,
  Play,
  Sparkles
} from "lucide-react";
import GithubIcon from "@/components/icons/GithubIcon";

interface HelpPageProps {
  path: string;
  onClose: () => void;
  navigateTo: (params: Record<string, string | null>, pathname?: string) => void;
  isEmbedded?: boolean;
}

export default function HelpPage({ path, onClose, navigateTo, isEmbedded = false }: HelpPageProps) {
  const segments = path.split('/');
  const lastSegment = segments[segments.length - 1];
  const isWorkspaceHelp = path.startsWith('/workspace/help');
  const baseHelpPath = isWorkspaceHelp ? '/workspace/help' : '/help';

  // Determine active tab from path or default to overview
  const validTabs = ['overview', 'modes', 'local', 'github', 'editor', 'compiler', 'data', 'genai', 'phases', 'tips', 'resources'];
  const activeTab = validTabs.includes(lastSegment) ? lastSegment : 'overview';

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [markdownContent, setMarkdownContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [prevTab, setPrevTab] = useState(activeTab);
  if (activeTab !== prevTab) {
    setPrevTab(activeTab);
    setIsLoading(true);
  }

  const setActiveTab = (tab: string) => {
    navigateTo({}, `${baseHelpPath}/${tab}`);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
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
    <div
      className={
        isEmbedded
          ? "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-nb-surface"
          : "fixed inset-0 z-1100 flex animate-in flex-col bg-nb-bg fade-in duration-300"
      }
    >
      {!isEmbedded && (
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-nb-outline-variant/30 bg-nb-surface px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 text-nb-on-surface-variant transition-colors hover:bg-nb-surface-low md:hidden"
            >
              <Book size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-nb-primary/10 text-nb-primary">
                <Book size={16} />
              </div>
              <div>
                <h1 className="text-sm leading-tight font-black tracking-tight text-nb-on-surface">
                  Help & Documentation
                </h1>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg p-1.5 text-xs font-bold text-nb-on-surface-variant transition-colors hover:bg-nb-surface-low hover:text-nb-on-surface"
            title="Close Help"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isEmbedded && (
        <div className="flex shrink-0 items-center gap-2 border-b border-nb-outline-variant/20 bg-nb-surface px-4 py-2.5 md:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-1.5 text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
          >
            <Book size={16} />
          </button>
          <span className="text-nb-label font-semibold text-nb-on-surface">Help Topics</span>
        </div>
      )}

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Mobile Sidebar Backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-450 bg-black/50 backdrop-blur-xs md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar Nav */}
        <div className={`
          fixed md:relative inset-y-0 left-0 z-500 md:z-auto
          w-72 md:w-60 border-r border-nb-outline-variant/30 p-4 flex flex-col gap-1.5 bg-nb-surface-low
          overflow-y-auto custom-scrollbar
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="px-3 py-1 flex items-center justify-between">
            <h3 className="text-nb-caption font-bold uppercase tracking-wider text-nb-on-surface-variant/60">Overview</h3>
            <button className="md:hidden text-nb-on-surface-variant/60 hover:text-nb-on-surface" onClick={() => setIsSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <NavButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<Compass size={15} />} label="Getting Started" />

          <div className="px-3 py-1 mt-3">
            <h3 className="text-nb-caption font-bold uppercase tracking-wider text-nb-on-surface-variant/60">Setup</h3>
          </div>
          <NavButton active={activeTab === 'modes'} onClick={() => setActiveTab('modes')} icon={<Settings size={15} />} label="Workspace Modes" />
          <NavButton active={activeTab === 'local'} onClick={() => setActiveTab('local')} icon={<HardDrive size={15} />} label="Local Setup" />
          <NavButton active={activeTab === 'github'} onClick={() => setActiveTab('github')} icon={<GithubIcon size={15} />} label="GitHub Setup" />

          <div className="px-3 py-1 mt-3">
            <h3 className="text-nb-caption font-bold uppercase tracking-wider text-nb-on-surface-variant/60">Using the Editor</h3>
          </div>
          <NavButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<FileText size={15} />} label="Editor Guide" />
          <NavButton active={activeTab === 'compiler'} onClick={() => setActiveTab('compiler')} icon={<Play size={15} />} label="PDF Compilation" />
          <NavButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Layers size={15} />} label="Import / Export" />
          <NavButton active={activeTab === 'genai'} onClick={() => setActiveTab('genai')} icon={<Sparkles size={15} />} label="Generative AI" />

          <div className="px-3 py-1 mt-3">
            <h3 className="text-nb-caption font-bold uppercase tracking-wider text-nb-on-surface-variant/60">Best Practices</h3>
          </div>
          <NavButton active={activeTab === 'phases'} onClick={() => setActiveTab('phases')} icon={<Target size={15} />} label="Design Process" />
          <NavButton active={activeTab === 'tips'} onClick={() => setActiveTab('tips')} icon={<Lightbulb size={15} />} label="Notebook Tips" />
          <NavButton active={activeTab === 'resources'} onClick={() => setActiveTab('resources')} icon={<ExternalLink size={15} />} label="Resources" />
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-nb-surface custom-scrollbar relative" style={{ scrollbarGutter: 'stable' }}>
          <div className="mx-auto w-full max-w-4xl p-6 pb-24 md:px-10 md:py-8 lg:px-12">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-8 h-8 text-nb-primary animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant/40">Loading content...</span>
              </div>
            ) : (
              <div>
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
                    pre: ({ children }) => (
                      <pre className="my-6 overflow-x-auto rounded-2xl border border-nb-outline-variant/30 bg-nb-surface-mid px-5 py-4 text-sm leading-relaxed shadow-sm">
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
                      const isBlockCode = typeof className === "string" && className.includes("language-");

                      if (!isBlockCode) {
                        return (
                          <code className="rounded bg-nb-surface-mid px-1.5 py-0.5 font-mono text-sm text-nb-primary border border-nb-outline-variant/30">
                            {children}
                          </code>
                        );
                      }

                      return (
                        <code className="block whitespace-pre font-mono text-nb-on-surface">
                          {children}
                        </code>
                      );
                    },
                    blockquote: ({ children }) => (
                      <div className={activeTab === "genai"
                        ? "my-8 not-italic rounded-2xl border-2 border-amber-500/70 bg-amber-500/10 px-6 py-5 text-nb-on-surface leading-relaxed font-medium [&>p]:mb-3 [&>p:last-child]:mb-0"
                        : "my-6 rounded-r-2xl border-l-4 border-nb-primary bg-nb-primary/5 px-6 py-5 italic text-nb-on-surface leading-relaxed [&>p]:mb-3 [&>p:last-child]:mb-0"
                      }>
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
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-nb-lg text-nb-label font-semibold transition-colors cursor-pointer text-left ${active
        ? "bg-nb-primary/10 text-nb-primary"
        : "text-nb-on-surface-variant hover:bg-nb-surface hover:text-nb-on-surface"
        }`}
    >
      <div className={active ? "text-nb-primary" : "text-nb-on-surface-variant/80"}>{icon}</div>
      <span className="truncate">{label}</span>
    </button>
  );
}
