"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";
import {
  Edit3, FileText, Download, ArrowRight,
  Shield, Bold, Italic, List, Type, Sun, Moon,
  Sigma, Code, Image as ImageIcon, Table as TableIcon, Terminal, Link as LinkIcon,
  Lock, WifiOff, ChevronDown
} from "lucide-react";
import Logo from "./ui/Logo";
import GithubIcon from "./ui/GithubIcon";

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

  const scrollToId = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-nb-bg overflow-y-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
      <style dangerouslySetInnerHTML={{ __html: BLINK_CSS }} />
      {/* Navigation */}
      <div className="sticky top-0 z-10 bg-nb-bg/80 backdrop-blur-md border-b border-nb-outline-variant/30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-3 hover:opacity-70 transition-opacity cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-nb-primary flex items-center justify-center shadow-lg shadow-nb-primary/20 group-hover:scale-110 transition-transform">
              <Logo className="text-white" size={20} strokeWidth={20} />
            </div>
            <span className="font-black tracking-tight text-nb-on-surface">ENGen</span>
          </button>
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
      <section id="hero" className="relative py-20 lg:py-32 overflow-hidden min-h-[80vh] flex flex-col justify-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full pointer-events-none">
          <div className="absolute top-1/4 left-0 w-64 h-64 bg-nb-primary/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-nb-tertiary/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <h1 className="text-5xl lg:text-7xl font-black text-nb-on-surface leading-[1.1] tracking-tight mb-8">
            Professional Engineering Notebooks, <span className="text-nb-primary">Simplified.</span>
          </h1>
          <p className="text-lg lg:text-xl text-nb-on-surface-variant/80 mb-12 leading-relaxed max-w-2xl mx-auto font-medium">
            We built this because engineering notebooks are tedious to document and format.
            Spend less time wrestling with margins and more time on documenting your design.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => scrollToId('features')}
              className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-nb-primary text-white text-sm font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-2xl shadow-nb-primary/30 active:scale-95 cursor-pointer flex items-center justify-center gap-3"
            >
              Explore Features
              <ChevronDown size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Detailed Features Grid */}
      <section id="features" className="py-24 bg-nb-surface-low overflow-hidden border-y border-nb-outline-variant/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-nb-on-surface mb-4 tracking-tight">Powerful Editor Features</h2>
            <p className="text-nb-on-surface-variant font-medium">Everything you need for technical documentation.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Sigma size={24} className="text-nb-primary" />}
              title="Math Rendering"
              description="Full support for Inline and Block LaTeX math. Write complex equations and see them rendered instantly with KaTeX."
            />
            <FeatureCard
              icon={<Code size={24} className="text-nb-tertiary" />}
              title="Code Blocks"
              description="Document your software with syntax-highlighted code blocks. Perfect for sharing algorithms and control logic."
            />
            <FeatureCard
              icon={<ImageIcon size={24} className="text-nb-primary" />}
              title="Smart Images"
              description="Drag and drop images with automatic captioning and sizing. All images are handled as standard LaTeX figures."
            />
            <FeatureCard
              icon={<TableIcon size={24} className="text-nb-tertiary" />}
              title="Dynamic Tables"
              description="Create and manage complex data tables with ease. No more wrestling with LaTeX tabular environments."
            />
            <FeatureCard
              icon={<Terminal size={24} className="text-nb-primary" />}
              title="Raw LaTeX"
              description="Need more control? Insert raw LaTeX blocks anywhere in your entry for custom formatting and advanced packages."
            />
            <FeatureCard
              icon={<LinkIcon size={24} className="text-nb-tertiary" />}
              title="Cross-References"
              description="Automatically link to figures, tables, and other notebook entries. Build a connected web of documentation."
            />
          </div>

          <div className="mt-20 flex justify-center">
            <button
              onClick={() => scrollToId('pipeline')}
              className="flex flex-col items-center gap-3 text-nb-on-surface-variant hover:text-nb-primary transition-all group"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">See the Workflow</span>
              <div className="w-12 h-12 rounded-full border border-nb-outline-variant/30 flex items-center justify-center group-hover:border-nb-primary/30 group-hover:bg-nb-primary/5">
                <ChevronDown size={20} className="group-hover:translate-y-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Workflow Section with Carousel */}
      <section id="pipeline" className="py-24 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-nb-on-surface mb-4 tracking-tight">The Pipeline</h2>
            <p className="text-nb-on-surface-variant font-medium">From raw ideas to standard-compliant documentation.</p>
          </div>

          <PipelineCarousel />

          <div className="mt-20 flex justify-center">
            <button
              onClick={() => scrollToId('trust')}
              className="flex flex-col items-center gap-3 text-nb-on-surface-variant hover:text-nb-primary transition-all group"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Security & Standards</span>
              <div className="w-12 h-12 rounded-full border border-nb-outline-variant/30 flex items-center justify-center group-hover:border-nb-primary/30 group-hover:bg-nb-primary/5">
                <ChevronDown size={20} className="group-hover:translate-y-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Trust & Collaboration Grid */}
      <section id="trust" className="py-24 bg-nb-surface border-y border-nb-outline-variant/30 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-nb-on-surface mb-4 tracking-tight">Trust & Collaboration</h2>
            <p className="text-nb-on-surface-variant font-medium">Built for professional engineering standards.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-nb-surface-low p-8 rounded-[32px] border border-nb-outline-variant/30 shadow-nb-xl relative overflow-hidden group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="font-black text-nb-on-surface">Data Permanence</h3>
                  <p className="text-xs text-nb-on-surface-variant">Your files, forever.</p>
                </div>
              </div>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">
                We use LaTeX because it&apos;s the gold standard for engineering. Even if this website disappeared tomorrow, your translated LaTeX files remain standard plain text, editable and able to compile anywhere, forever.
              </p>
            </div>

            <div className="bg-nb-surface-low p-8 rounded-[32px] border border-nb-outline-variant/30 shadow-nb-xl relative overflow-hidden group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-nb-tertiary/10 text-nb-tertiary flex items-center justify-center">
                  <GithubIcon size={24} />
                </div>
                <div>
                  <h3 className="font-black text-nb-on-surface">GitHub Integration</h3>
                  <p className="text-xs text-nb-on-surface-variant">Professional Version Control.</p>
                </div>
              </div>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">
                Sync directly with your team&apos;s GitHub repository. Benefit from professional version control, branch management, and a unified source of truth for your notebook.
              </p>
            </div>

            <div className="bg-nb-surface-low p-8 rounded-[32px] border border-nb-outline-variant/30 shadow-nb-xl relative overflow-hidden group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
                  <Lock size={24} />
                </div>
                <div>
                  <h3 className="font-black text-nb-on-surface">Privacy First</h3>
                  <p className="text-xs text-nb-on-surface-variant">No central servers.</p>
                </div>
              </div>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">
                Your engineering designs are your own. Content is never stored on our servers. It lives solely on your machine or within your private GitHub repository.
              </p>
            </div>

            <div className="bg-nb-surface-low p-8 rounded-[32px] border border-nb-outline-variant/30 shadow-nb-xl relative overflow-hidden group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-nb-tertiary/10 text-nb-tertiary flex items-center justify-center">
                  <WifiOff size={24} />
                </div>
                <div>
                  <h3 className="font-black text-nb-on-surface">Offline Capability</h3>
                  <p className="text-xs text-nb-on-surface-variant">Document anywhere.</p>
                </div>
              </div>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">
                Document your work at the workbench or in the pits. Because the editor and LaTeX engine run entirely in your browser, you don&apos;t need a stable connection to stay productive.
              </p>
            </div>
          </div>

          <div className="mt-20 flex justify-center">
            <button
              onClick={() => scrollToId('origin')}
              className="flex flex-col items-center gap-3 text-nb-on-surface-variant hover:text-nb-primary transition-all group"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Our Story</span>
              <div className="w-12 h-12 rounded-full border border-nb-outline-variant/30 flex items-center justify-center group-hover:border-nb-primary/30 group-hover:bg-nb-primary/5">
                <ChevronDown size={20} className="group-hover:translate-y-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Origin Section */}
      <section id="origin" className="py-24 bg-nb-surface-low">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-4 mb-8">
              <Image src="/rr.svg" alt="Raider Robotics" width={80} height={80} className="h-20 w-auto" />
              <div className="h-12 w-px bg-nb-outline-variant/30" />
              <h2 className="text-3xl font-black text-nb-on-surface tracking-tight">Raider Robotics</h2>
            </div>
            <h3 className="text-4xl font-black text-nb-on-surface mb-6 tracking-tight">Built by Students, for Students</h3>
            <div className="max-w-2xl mx-auto space-y-4 text-nb-on-surface-variant font-medium leading-relaxed">
              <p>
                ENGen was developed by the <strong>MSOE Raider Robotics</strong> team. We are a student-led organization at the Milwaukee School of Engineering competing in the VEX U robotics competition.
              </p>
              <p>
                This tool was born from our own need for a streamlined documentation process that meets the high standards of professional engineering while maintaining the speed required in a fast-paced competition environment.
              </p>
              <div className="pt-6">
                <a
                  href="https://www.msoevex.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 text-xs font-black uppercase tracking-widest text-nb-primary hover:bg-nb-primary/5 transition-all shadow-nb-sm"
                >
                  Visit msoevex.com
                  <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-16 flex justify-center">
            <button
              onClick={() => scrollToId('cta')}
              className="flex flex-col items-center gap-3 text-nb-on-surface-variant hover:text-nb-primary transition-all group"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Ready?</span>
              <div className="w-12 h-12 rounded-full border border-nb-outline-variant/30 flex items-center justify-center group-hover:border-nb-primary/30 group-hover:bg-nb-primary/5">
                <ChevronDown size={20} className="group-hover:translate-y-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="cta" className="py-24 bg-nb-primary">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black text-white mb-6 tracking-tight">Ready to document better?</h2>
          <p className="text-white/80 mb-10 text-lg font-medium leading-relaxed">
            Start your digital engineering notebook today.
          </p>
          <button
            onClick={onTryIt}
            className="px-12 py-5 rounded-2xl bg-white text-nb-primary text-sm font-black uppercase tracking-widest hover:bg-nb-surface-low transition-all shadow-2xl active:scale-95 cursor-pointer"
          >
            Open the Editor
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-nb-outline-variant/30">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 grayscale opacity-30 hover:opacity-100 hover:grayscale-0 transition-all cursor-default">
            <Image src="/rr.svg" alt="Raider Robotics" width={24} height={24} className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">Made by MSOE Raider Robotics</span>
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
      title: "1. The Structural Editor",
      description: "Focus on your engineering content. Automatic captions for images and tables keep your structure consistent without the manual labor.",
      icon: <Edit3 size={20} />,
      color: "text-nb-primary",
      bg: "bg-nb-primary/10",
      mockup: <EditorMockup />
    },
    {
      title: "2. LaTeX Translation",
      description: "The editor translates your work into high-quality LaTeX code. It's actively maintained, open, and ensures your data is never locked in.",
      icon: <FileText size={20} />,
      color: "text-nb-tertiary",
      bg: "bg-nb-tertiary/10",
      mockup: <LatexMockup />
    },
    {
      title: "3. Compliant PDF Output",
      description: "One click to compile. Get a professional document with linked references, page numbers, and consistent styling every time.",
      icon: <Download size={20} />,
      color: "text-nb-primary",
      bg: "bg-nb-primary/10",
      mockup: <PdfMockup />
    }
  ];

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-8 lg:gap-12">
      {/* Selector Side */}
      <div className="w-full lg:w-[30%] flex flex-col gap-3">
        {steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => setActiveStep(idx)}
            className={`p-4 rounded-3xl text-left transition-all duration-300 border cursor-pointer ${activeStep === idx
              ? "bg-nb-surface border-nb-primary/30 shadow-nb-xl scale-[1.02]"
              : "bg-transparent border-transparent opacity-50 hover:opacity-100"
              }`}
          >
            <div className={`w-8 h-8 rounded-lg ${step.bg} ${step.color} flex items-center justify-center mb-3`}>
              {step.icon}
            </div>
            <h3 className="text-base font-black text-nb-on-surface mb-1">{step.title}</h3>
            <p className="text-xs text-nb-on-surface-variant font-medium leading-normal">
              {step.description}
            </p>
          </button>
        ))}
      </div>

      {/* Mockup Side */}
      <div className="w-full lg:w-[70%] aspect-[4/3] bg-nb-surface border border-nb-outline-variant/30 rounded-[32px] p-4 lg:p-6 shadow-nb-2xl relative overflow-hidden flex items-center justify-center">
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
          The main chassis was constructed using aircraft-grade aluminum. All joints were reinforced with 1/8&quot; gusset plates to ensure maximum rigidity during high-stress testing.
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
          <span className={isDark ? "text-[#ce9178]" : "text-[#a31515]"}>&quot;Chassis Assembly&quot;</span>
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
            The main chassis was constructed using aircraft-grade aluminum. All joints were reinforced with 1/8&quot; gusset plates to ensure maximum rigidity during high-stress testing.
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
