"use client";

import React, { useState } from "react";
import {
  Book,
  Settings,
  GitBranch,
  HardDrive,
  Zap,
  FileText,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Layers,
  Target,
  PenTool,
  FlaskConical,
  ClipboardCheck,
  ChevronRight,
  ExternalLink,
  Info,
  Download
} from "lucide-react";

interface HelpPageProps {
  path: string;
  onClose: () => void;
}

export default function HelpPage({ path, onClose }: HelpPageProps) {
  const isWorkspaceHelp = path === '/workspace/help';
  const [activeTab, setActiveTab] = useState('editor');
  const [designPhase, setDesignPhase] = useState(0);

  const phases = [
    {
      id: 0,
      title: "Define Problem",
      icon: <Target size={18} />,
      description: "Understand and document exactly what you are trying to solve.",
      items: [
        "Problem/Design statement",
        "SMART Goals (Specific, Measurable, Achievable, Relevant, Time-bound)",
        "Criteria & Constraints (What it must do, what limits exist)",
        "Deliverables and Deadlines"
      ],
      tips: "Be as specific as possible. If you don't define the problem clearly, your solution might solve the wrong thing."
    },
    {
      id: 1,
      title: "Generate Concepts",
      icon: <Lightbulb size={18} />,
      description: "Explore many different ideas before settling on one.",
      items: [
        "Research & Citations (What have others done?)",
        "Brainstorming sessions",
        "Sketches and CAD concepts",
        "Decision Matrix (Comparing ideas based on criteria)"
      ],
      tips: "Quantity over quality initially. Use a decision matrix to objectively choose the best path forward."
    },
    {
      id: 2,
      title: "Develop Solution",
      icon: <PenTool size={18} />,
      description: "Create a detailed plan for your chosen design.",
      items: [
        "Detailed CAD & Sketches with dimensions",
        "Math calculations and physics justifications",
        "Pseudocode for algorithms",
        "Clear annotations explaining design choices"
      ],
      tips: "This is your blueprint. Someone should be able to build your design just by looking at this section."
    },
    {
      id: 3,
      title: "Construct & Test",
      icon: <FlaskConical size={18} />,
      description: "Build it, break it, and learn from it.",
      items: [
        "Build pictures with annotations",
        "Parts list and instructions",
        "Test Plan (How will you measure success?)",
        "Quantitative Data (Tables, Charts, Graphs)",
        "Analysis of results"
      ],
      tips: "Document your failures just as much as your successes. Data is the core of a good notebook."
    },
    {
      id: 4,
      title: "Evaluate Solution",
      icon: <ClipboardCheck size={18} />,
      description: "Reflect on how well the solution met the original goals.",
      items: [
        "Reflection on Criteria/Constraints",
        "Recommended initial improvements",
        "Event reflections and feedback",
        "Final conclusion"
      ],
      tips: "Be honest. What would you do differently if you had another week?"
    }
  ];

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
          className="p-2.5 hover:bg-nb-surface-mid rounded-xl text-nb-on-surface-variant hover:text-nb-on-surface transition-all active:scale-95"
        >
          <Zap size={20} className="rotate-45" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav */}
        <div className="w-64 border-r border-nb-outline-variant/30 p-6 flex flex-col gap-2">
          {isWorkspaceHelp ? (
            <>
              <NavButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<FileText size={16} />} label="Editor Guide" />
              <NavButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Layers size={16} />} label="Import / Export" />
              <NavButton active={activeTab === 'phases'} onClick={() => setActiveTab('phases')} icon={<Target size={16} />} label="Design Process" />
              <NavButton active={activeTab === 'tips'} onClick={() => setActiveTab('tips')} icon={<Lightbulb size={16} />} label="Notebook Tips" />
            </>
          ) : (
            <>
              <NavButton active={activeTab === 'modes'} onClick={() => setActiveTab('modes')} icon={<Settings size={16} />} label="Workspace Modes" />
              <NavButton active={activeTab === 'local'} onClick={() => setActiveTab('local')} icon={<HardDrive size={16} />} label="Local Setup" />
              <NavButton active={activeTab === 'github'} onClick={() => setActiveTab('github')} icon={<GitBranch size={16} />} label="GitHub Setup" />
            </>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-12 bg-nb-bg/50">
          <div className="max-w-4xl mx-auto space-y-12 pb-20">

            {activeTab === 'modes' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">Workspace Modes</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    The Engineering Notebook Editor supports three distinct ways to manage your data.
                    Choose the one that best fits your team's workflow.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <ModeCard
                    icon={<HardDrive className="text-blue-500" />}
                    title="Local Folder"
                    desc="Directly edits files on your computer. Requires a folder structure."
                    status="Best for Individual use"
                  />
                  <ModeCard
                    icon={<GitBranch className="text-nb-on-surface" />}
                    title="GitHub"
                    desc="Syncs with a repository. Best for collaboration and history."
                    status="Recommended for Teams"
                  />
                  <ModeCard
                    icon={<Zap className="text-yellow-500" />}
                    title="Temporary"
                    desc="Everything is saved in your browser's database. No setup needed."
                    status="Best for Quick tests"
                  />
                </div>
              </section>
            )}

            {activeTab === 'local' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">Setting up a Local Workspace</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    To use the Local Folder mode, you need a specific directory structure that the editor understands.
                  </p>
                </div>

                <div className="bg-nb-surface border border-nb-outline-variant rounded-3xl p-8 space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-nb-primary text-white flex items-center justify-center shrink-0 font-black">1</div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-nb-on-surface">Download the Template</h3>
                      <p className="text-sm text-nb-on-surface-variant">
                        Go to the <a href="https://github.com/msoe-vex/engineering-notebook-template" target="_blank" className="text-nb-primary hover:underline font-bold inline-flex items-center gap-1">Template Repository <ExternalLink size={12} /></a> and download the ZIP file.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-nb-primary text-white flex items-center justify-center shrink-0 font-black">2</div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-nb-on-surface">Extract to Folder</h3>
                      <p className="text-sm text-nb-on-surface-variant">
                        Extract the files into a folder on your computer (e.g., "Engineering Notebook 2024").
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-nb-primary text-white flex items-center justify-center shrink-0 font-black">3</div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-nb-on-surface">Connect in Editor</h3>
                      <p className="text-sm text-nb-on-surface-variant">
                        In the Editor's settings, choose "Local Folder" and select the folder you just created.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex items-start gap-4">
                  <Info className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700/80 leading-relaxed">
                    <strong>Note:</strong> The browser will ask for permission each time you return to the site. This is a security feature to ensure you are in control of your local files.
                  </p>
                </div>
              </section>
            )}

            {activeTab === 'github' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">GitHub Collaboration</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    Syncing with GitHub allows multiple team members to work on the notebook while keeping a full history of every change.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-nb-surface border border-nb-outline-variant rounded-2xl space-y-3">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2"><ArrowRight size={16} className="text-nb-primary" /> Staging Changes</h3>
                    <p className="text-xs text-nb-on-surface-variant leading-relaxed">
                      When you save an entry, it is stored locally in your browser. These are "Pending Changes".
                    </p>
                  </div>
                  <div className="p-6 bg-nb-surface border border-nb-outline-variant rounded-2xl space-y-3">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2"><ArrowRight size={16} className="text-nb-primary" /> Committing</h3>
                    <p className="text-xs text-nb-on-surface-variant leading-relaxed">
                      Use the "Push to GitHub" button in the sidebar to upload all your pending changes to the repository at once.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'editor' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">Using the Editor</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    Our editor is built specifically for Engineering Notebooks, with native support for LaTeX and resource tracking.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-6 items-start">
                    <div className="p-3 bg-nb-primary/10 text-nb-primary rounded-xl"><Zap size={24} /></div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-nb-on-surface">References (@)</h3>
                      <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                        Type <code className="bg-nb-surface-mid px-1.5 py-0.5 rounded text-nb-primary font-bold">@</code> anywhere to link to another entry, an image, or a specific heading. This ensures your notebook is interconnected and easy to navigate.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-6 items-start">
                    <div className="p-3 bg-nb-primary/10 text-nb-primary rounded-xl"><FileText size={24} /></div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-nb-on-surface">Rich Text & Images</h3>
                      <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                        Drag and drop images directly into the editor. Use the toolbar for bold, italics, tables, and lists. Everything is automatically converted to clean LaTeX in the background.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'data' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">Import & Export</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    Easily move your data between different workspace modes or back it up.
                  </p>
                </div>

                <div className="bg-nb-surface border border-nb-outline-variant rounded-3xl overflow-hidden">
                  <div className="p-8 border-b border-nb-outline-variant/30 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-nb-on-surface">Export Notebook</h3>
                      <p className="text-sm text-nb-on-surface-variant">Download everything (entries, images, team data) as a single JSON file.</p>
                    </div>
                    <Download className="text-nb-on-surface-variant/40" />
                  </div>
                  <div className="p-8 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-nb-on-surface">Import Notebook</h3>
                      <p className="text-sm text-nb-on-surface-variant">Upload a previously exported JSON file to restore your work into any workspace.</p>
                    </div>
                    <ArrowRight className="text-nb-on-surface-variant/40" />
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'phases' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">The Design Process</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    Following a structured design process is a core requirement for a high-scoring engineering notebook.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {phases.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setDesignPhase(p.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${designPhase === p.id ? 'bg-nb-primary text-white shadow-lg shadow-nb-primary/20' : 'bg-nb-surface text-nb-on-surface-variant hover:bg-nb-surface-mid'}`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>

                <div className="bg-nb-surface border border-nb-outline-variant rounded-3xl p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
                      {phases[designPhase].icon}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-nb-on-surface">{phases[designPhase].title}</h3>
                      <p className="text-sm text-nb-on-surface-variant">{phases[designPhase].description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-primary">What to include</h4>
                      <ul className="space-y-3">
                        {phases[designPhase].items.map((item, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm text-nb-on-surface-variant">
                            <CheckCircle2 size={16} className="text-nb-tertiary shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-primary">Expert Tip</h4>
                      <div className="p-6 bg-nb-primary/5 rounded-2xl border border-nb-primary/10 italic text-sm text-nb-on-surface leading-relaxed">
                        "{phases[designPhase].tips}"
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'tips' && (
              <section className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black tracking-tight text-nb-on-surface">Tips for a Great Notebook</h2>
                  <p className="text-nb-on-surface-variant leading-relaxed">
                    Beyond the technical details, these habits will help your team stand out during judging.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-nb-surface border border-nb-outline-variant rounded-3xl space-y-4">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2 text-nb-primary"><CheckCircle2 size={18} /> Consistency is Key</h3>
                    <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                      Update the notebook every single time the team meets. Gaps in dates are a major red flag for judges.
                    </p>
                  </div>
                  <div className="p-8 bg-nb-surface border border-nb-outline-variant rounded-3xl space-y-4">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2 text-nb-primary"><CheckCircle2 size={18} /> Label Everything</h3>
                    <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                      Every photo and sketch should have a caption. Use our "Caption" field to ensure they are properly numbered and indexed.
                    </p>
                  </div>
                  <div className="p-8 bg-nb-surface border border-nb-outline-variant rounded-3xl space-y-4">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2 text-nb-primary"><CheckCircle2 size={18} /> Show the "Why"</h3>
                    <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                      Don't just show what you built. Explain why you chose that design, what other options you considered, and how you decided.
                    </p>
                  </div>
                  <div className="p-8 bg-nb-surface border border-nb-outline-variant rounded-3xl space-y-4">
                    <h3 className="font-bold text-nb-on-surface flex items-center gap-2 text-nb-primary"><CheckCircle2 size={18} /> Quantitative Data</h3>
                    <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                      Use tables for testing results. Numerical data is much more convincing than "it felt faster".
                    </p>
                  </div>
                </div>
              </section>
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
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active
        ? "bg-nb-primary text-white shadow-lg shadow-nb-primary/20"
        : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface"
        }`}
    >
      <div className={active ? "text-white" : "text-nb-primary"}>{icon}</div>
      {label}
    </button>
  );
}

function ModeCard({ icon, title, desc, status }: { icon: React.ReactNode, title: string, desc: string, status: string }) {
  return (
    <div className="p-6 bg-nb-surface border border-nb-outline-variant rounded-3xl space-y-4 hover:border-nb-primary/30 transition-all group">
      <div className="w-12 h-12 rounded-2xl bg-nb-bg flex items-center justify-center group-hover:scale-110 transition-transform">{icon}</div>
      <div className="space-y-1">
        <h3 className="font-bold text-nb-on-surface">{title}</h3>
        <p className="text-xs text-nb-on-surface-variant leading-relaxed">{desc}</p>
      </div>
      <div className="pt-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-nb-primary bg-nb-primary/5 px-2.5 py-1 rounded-full">{status}</span>
      </div>
    </div>
  );
}
