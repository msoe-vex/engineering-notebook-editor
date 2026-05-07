import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin shadow-xl"></div>
        <Loader2 className="h-10 w-10 text-primary animate-pulse" />
      </div>
      <h2 className="mt-8 text-xl font-semibold tracking-tight text-foreground animate-pulse">
        Loading Notebook...
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-[200px] text-center leading-relaxed">
        Preparing your workspace and syncing data
      </p>
    </div>
  );
}
