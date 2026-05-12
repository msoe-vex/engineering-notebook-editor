"use client";

import { BookOpen, Edit3, FileText, Download, Zap, Heart, ArrowRight, Shield, Globe } from "lucide-react";

interface AboutPageProps {
  onClose: () => void;
  onTryIt: () => void;
}

export default function AboutPage({ onClose, onTryIt }: AboutPageProps) {
  return (
    <div className="fixed inset-0 z-[1000] bg-nb-bg overflow-y-auto custom-scrollbar">
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

      {/* Workflow Section */}
      <section className="py-24 bg-nb-surface-low">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-nb-on-surface mb-4 tracking-tight">The Professional Pipeline</h2>
            <p className="text-nb-on-surface-variant font-medium">How we turn your ideas into standard-compliant documentation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 flex items-center justify-center mb-6 shadow-nb-lg group-hover:border-nb-primary/50 transition-all">
                <Edit3 size={28} className="text-nb-primary" />
              </div>
              <h3 className="text-lg font-bold text-nb-on-surface mb-3">1. Rich Text Editor</h3>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                Write naturally using a familiar editor. Add headings, images, and tables with automatic captioning and numbering.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 flex items-center justify-center mb-6 shadow-nb-lg group-hover:border-nb-tertiary/50 transition-all">
                <FileText size={28} className="text-nb-tertiary" />
              </div>
              <h3 className="text-lg font-bold text-nb-on-surface mb-3">2. Automatic LaTeX</h3>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                Your content is instantly translated into beautiful LaTeX code behind the scenes. No complex syntax to memorize.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-2xl bg-nb-primary flex items-center justify-center mb-6 shadow-nb-xl shadow-nb-primary/20">
                <Download size={28} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-nb-on-surface mb-3">3. High-Quality PDF</h3>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed">
                Compile everything into a perfectly formatted PDF. Automated cover pages, team bios, and linked indexes.
              </p>
            </div>
          </div>
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

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-primary/30 transition-all shadow-nb-sm">
      <div className="mb-6">{icon}</div>
      <h3 className="text-lg font-black text-nb-on-surface mb-3 tracking-tight">{title}</h3>
      <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">{description}</p>
    </div>
  );
}
