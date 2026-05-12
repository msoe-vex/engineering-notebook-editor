"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { BookOpen, Edit3, FileText, Download, Zap, Heart, ArrowRight, Shield, Globe, Bold, Italic, List, Type, Terminal, Check, Sun, Moon } from "lucide-react";

const BLINK_CSS = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
`;

interface AboutPageProps {
  onClose: () => void;
  onTryIt: () => void;
}

export default function AboutPage({ onClose, onTryIt }: AboutPageProps) {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <div className="fixed inset-0 z-[1000] bg-nb-bg overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
      <style dangerouslySetInnerHTML={{ __html: BLINK_CSS }} />
      {/* Navigation */}
      <div className="sticky top-0 z-10 bg-nb-bg/80 backdrop-blur-md border-b border-nb-outline-variant/30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-nb-primary flex items-center justify-center shadow-lg shadow-nb-primary/20">
              <BookOpen size={18} className="text-white" />
            </div>
            <span className="font-black tracking-tight text-nb-on-surface">Notebook</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors cursor-pointer"
              title="Toggle Theme"
            >
              {resolvedTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={onTryIt}
              className="px-4 py-2 rounded-xl bg-nb-primary text-white text-xs font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-lg shadow-nb-primary/20 active:scale-95 cursor-pointer"
            >
              Try It
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors cursor-pointer"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full pointer-events-none">
          <div className="absolute top-1/4 left-0 w-64 h-64 bg-nb-primary/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-nb-tertiary/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <h1 className="text-5xl lg:text-7xl font-black text-nb-on-surface leading-[1.1] tracking-tight mb-8">
            Professional Engineering Notebooks, <span className="text-nb-primary">Simplified.</span>
          </h1>
          <p className="text-lg lg:text-xl text-nb-on-surface-variant/80 mb-12 leading-relaxed max-w-2xl mx-auto font-medium">
            Go from rough notes to professional, competition-ready PDFs in seconds.
            All the power of LaTeX, without the steep learning curve.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onTryIt}
              className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-nb-primary text-white text-sm font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-2xl shadow-nb-primary/30 active:scale-95 cursor-pointer flex items-center justify-center gap-3"
            >
              Start Your Notebook
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Workflow Section with Carousel */}
      <section className="py-24 bg-nb-surface-low overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-nb-on-surface mb-4 tracking-tight">The Professional Pipeline</h2>
            <p className="text-nb-on-surface-variant font-medium">How we turn your ideas into standard-compliant documentation.</p>
          </div>

          <PipelineCarousel />
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<Zap size={24} className="text-nb-primary" />}
              title="Fast & Lightweight"
              description="Runs entirely in your browser using WASM technology. No server-side processing needed for standard builds."
            />
            <FeatureCard
              icon={<Shield size={24} className="text-nb-tertiary" />}
              title="Your Data, Your Way"
              description="Choose between local folder sync or GitHub integration. We never store your notebook content on our servers."
            />
            <FeatureCard
              icon={<Globe size={24} className="text-nb-primary" />}
              title="GitHub Integration"
              description="Full version control and cloud backups. Collaborative editing made easy through standard Git workflows."
            />
            <FeatureCard
              icon={<Heart size={24} className="text-nb-tertiary" />}
              title="Free & Open Source"
              description="Completely free to use with no hidden costs. Built by engineers, for engineers."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-nb-primary">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black text-white mb-6 tracking-tight">Ready to build something amazing?</h2>
          <p className="text-white/80 mb-10 text-lg font-medium leading-relaxed">
            Start creating your digital engineering notebook.
          </p>
          <button
            onClick={onTryIt}
            className="px-12 py-5 rounded-2xl bg-white text-nb-primary text-sm font-black uppercase tracking-widest hover:bg-nb-surface-low transition-all shadow-2xl active:scale-95 cursor-pointer"
          >
            Get Started Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-nb-outline-variant/30">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 opacity-50 grayscale">
            <BookOpen size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Engineering Notebook</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PipelineCarousel() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "1. The Rich Text Editor",
      description: "Focus on your engineering content with a familiar interface. Automatic captions for images and tables keep your notebook organized.",
      icon: <Edit3 size={20} />,
      color: "text-nb-primary",
      bg: "bg-nb-primary/10",
      mockup: <EditorMockup />
    },
    {
      title: "2. Automatic LaTeX Generation",
      description: "No more wrestling with curly braces. The editor instantly translates your structure into professional LaTeX code.",
      icon: <FileText size={20} />,
      color: "text-nb-tertiary",
      bg: "bg-nb-tertiary/10",
      mockup: <LatexMockup />
    },
    {
      title: "3. Professional PDF Output",
      description: "One click to compile. Your work is transformed into a high-standard engineering document with linked references and page numbers.",
      icon: <Download size={20} />,
      color: "text-nb-primary",
      bg: "bg-nb-primary/10",
      mockup: <PdfMockup />
    }
  ];

  return (
    <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
      {/* Selector Side */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        {steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => setActiveStep(idx)}
            className={`p-6 rounded-3xl text-left transition-all duration-300 border cursor-pointer ${activeStep === idx
              ? "bg-nb-surface border-nb-primary/30 shadow-nb-xl scale-[1.02]"
              : "bg-transparent border-transparent opacity-50 hover:opacity-100"
              }`}
          >
            <div className={`w-10 h-10 rounded-xl ${step.bg} ${step.color} flex items-center justify-center mb-4`}>
              {step.icon}
            </div>
            <h3 className="text-lg font-black text-nb-on-surface mb-2">{step.title}</h3>
            <p className="text-sm text-nb-on-surface-variant font-medium leading-relaxed">
              {step.description}
            </p>
          </button>
        ))}
      </div>

      {/* Mockup Side */}
      <div className="w-full lg:w-2/3 aspect-[16/10] bg-nb-surface border border-nb-outline-variant/30 rounded-[32px] p-4 lg:p-8 shadow-nb-2xl relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-nb-primary/20">
          <div
            className="h-full bg-nb-primary transition-all duration-500 ease-out"
            style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
          {steps[activeStep].mockup}
        </div>
      </div>
    </div>
  );
}

function EditorMockup() {
  return (
    <div className="w-full h-full bg-nb-bg rounded-2xl border border-nb-outline-variant/30 shadow-inner flex flex-col overflow-hidden">
      <div className="h-10 border-b border-nb-outline-variant/30 flex items-center px-4 gap-4 bg-nb-surface">
        <Bold size={14} className="text-nb-on-surface-variant" />
        <Italic size={14} className="text-nb-on-surface-variant" />
        <List size={14} className="text-nb-primary" />
        <Type size={14} className="text-nb-on-surface-variant" />
      </div>
      <div className="p-8 flex flex-col gap-4 overflow-hidden">
        <div className="text-lg font-black text-nb-on-surface">Chassis Assembly</div>
        <div className="text-sm font-bold text-nb-primary">Structural Integrity</div>
        <div className="text-xs text-nb-on-surface-variant leading-relaxed">
          The main chassis was constructed using aircraft-grade aluminum. All joints were reinforced with 1/8" gusset plates to ensure maximum rigidity during high-stress testing.
          <span className="inline-block w-[1.5px] h-3 bg-nb-primary ml-1 animate-[blink_1s_infinite]" />
        </div>
        <div className="mt-2 text-[10px] font-bold text-nb-primary/80">
          See also: <span className="underline decoration-nb-primary/40 underline-offset-2 cursor-pointer hover:text-nb-primary transition-colors">Structural Analysis</span>
        </div>
      </div>
    </div>
  );
}

function LatexMockup() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className={`w-full h-full rounded-2xl shadow-nb-2xl flex flex-col overflow-hidden font-mono text-[10px] lg:text-xs transition-colors duration-300 ${isDark ? "bg-[#1e1e1e] text-white/80" : "bg-[#f3f3f3] text-black/80"}`}>
      <div className={`h-10 border-b flex items-center px-4 gap-4 transition-colors duration-300 ${isDark ? "bg-[#252526] border-white/10" : "bg-[#e8e8e8] border-black/10"}`}>
        <div className="flex gap-1">
          <div className={`px-2 py-1 border-b-2 text-[10px] font-bold ${isDark ? "bg-nb-primary/20 border-nb-primary text-nb-primary" : "bg-nb-primary/10 border-nb-primary text-nb-primary"}`}>entry.tex</div>
        </div>
      </div>
      <div className="p-8 flex flex-col gap-2">
        <div>
          <span className={isDark ? "text-[#569cd6]" : "text-[#0000ff]"}>\\notebookentry</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"{"}</span>
          <span className={isDark ? "text-[#ce9178]" : "text-[#a31515]"}>"Chassis Assembly"</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"}"}</span>
        </div>
        <div>
          <span className={isDark ? "text-[#569cd6]" : "text-[#0000ff]"}>\\section</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"{"}</span>
          Structural Integrity
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"}"}</span>
        </div>
        <div className="opacity-70">The main chassis was constructed using aircraft-grade aluminum...</div>
        <div>
          <span className={isDark ? "text-[#569cd6]" : "text-[#0000ff]"}>\\notebooklink</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"{"}</span>Structural Analysis<span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"}"}</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"{"}</span>entry<span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"}"}</span>
          <span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"{"}</span>uuid-123<span className={isDark ? "text-[#ffd700]" : "text-[#af00db]"}>{"}"}</span>
        </div>
        <div className={`${isDark ? "text-[#6a9955]" : "text-[#008000]"} italic opacity-80 mt-2`}>% Automatically generated by Notebook Pipeline</div>
      </div>
    </div>
  );
}

function PdfMockup() {
  return (
    <div className="w-full h-full bg-nb-surface-mid p-2 lg:p-6 flex items-center justify-center">
      <div className="h-full aspect-[1/1.414] max-w-full bg-white shadow-2xl rounded-sm p-4 lg:p-8 flex flex-col relative overflow-hidden">
        {/* PDF Header */}
        <div className="border-b-[1px] border-nb-primary/20 pb-2 mb-4 flex justify-between items-end shrink-0">
          <div>
            <div className="text-[8px] lg:text-[10px] font-black text-nb-primary uppercase tracking-tighter">Chassis Assembly</div>
            <div className="text-[6px] lg:text-[8px] text-gray-400 font-bold uppercase">Engineering Notebook</div>
          </div>
          <div className="text-[6px] lg:text-[8px] font-bold text-gray-500">Page 1</div>
        </div>
        
        {/* PDF Content */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="text-[10px] font-black text-nb-primary shrink-0">Structural Integrity</div>
          <div className="text-[7px] text-nb-on-surface leading-tight">
            The main chassis was constructed using aircraft-grade aluminum. All joints were reinforced with 1/8" gusset plates to ensure maximum rigidity during high-stress testing.
          </div>
          <div className="mt-2 p-3 border border-gray-100 rounded bg-gray-50/50 flex flex-col items-center shrink-0">
            <div className="w-full aspect-video bg-gray-200 rounded flex items-center justify-center text-gray-400">
              <Download size={20} className="opacity-20" />
            </div>
            <div className="mt-2 text-[6px] font-bold text-gray-400">Figure 1.1: Structural Analysis</div>
          </div>
        </div>

        {/* PDF Footer decoration */}
        <div className="absolute bottom-0 left-0 w-full h-1 bg-nb-primary/10" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-primary/30 transition-all shadow-nb-sm group">
      <div className="mb-6 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-lg font-black text-nb-on-surface mb-3 tracking-tight">{title}</h3>
      <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">{description}</p>
    </div>
  );
}
