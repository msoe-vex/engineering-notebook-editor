import React from 'react';
import Logo from './ui/Logo';

interface LoadingOverlayProps {
  label?: string;
  subtitle?: string;
}

export default function LoadingOverlay({ 
  label = "ENGen", 
  subtitle = "Engineering Notebook Generator" 
}: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center font-sans animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-[2.5rem] bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30 animate-pulse">
          <Logo className="text-white" size={48} strokeWidth={18} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-xl font-black tracking-tight text-white uppercase">
            {label}
          </h1>
          <p className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1 mt-4">
          <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce" />
        </div>
      </div>
    </div>
  );
}
