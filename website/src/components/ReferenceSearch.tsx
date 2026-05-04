"use client";

import React, { useState, useMemo } from "react";
import { Search, X, FileText, ImageIcon, Table as TableIcon, Code } from "lucide-react";
import { NotebookMetadata } from "@/lib/metadata";

interface ReferenceSearchProps {
  metadata: NotebookMetadata;
  onClose: () => void;
  onSelect: (uuid: string, title: string, type: string) => void;
}

export default function ReferenceSearch({ metadata, onClose, onSelect }: ReferenceSearchProps) {
  const [query, setQuery] = useState("");

  const allResources = useMemo(() => {
    const list: any[] = [];
    
    if (!metadata || !metadata.entries) return list;

    for (const [entryId, entry] of Object.entries(metadata.entries)) {
      // Add the entry itself as a resource
      list.push({
        id: entry.id,
        title: entry.title,
        type: "entry",
        entryTitle: entry.title,
        entryDate: entry.createdAt ? entry.createdAt.split('T')[0] : "No Date",
      });
      
      // Add blocks
      if (entry.resources) {
        for (const [resId, res] of Object.entries(entry.resources)) {
          list.push({
            id: resId,
            title: res.title,
            type: res.type,
            entryTitle: entry.title,
            entryDate: entry.createdAt ? entry.createdAt.split('T')[0] : "No Date",
          });
        }
      }
    }
    
    return list;
  }, [metadata]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allResources;
    const q = query.toLowerCase();
    return allResources.filter(r => 
      (r.title || "").toLowerCase().includes(q) || 
      (r.entryTitle || "").toLowerCase().includes(q) ||
      (r.type || "").toLowerCase().includes(q)
    );
  }, [allResources, query]);

  const getIcon = (type: string) => {
    switch (type) {
      case "entry": return <FileText size={16} />;
      case "image": return <ImageIcon size={16} />;
      case "table": return <TableIcon size={16} />;
      case "codeBlock": return <Code size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-md px-4 py-8" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-nb-surface rounded-3xl shadow-nb-xl border border-nb-outline-variant flex flex-col max-h-full animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-nb-outline-variant/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black tracking-widest text-nb-secondary">Reference Tool</h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-nb-surface-high transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for entries, images, tables, or code..."
              className="w-full pl-12 pr-4 py-4 bg-nb-surface-low border border-nb-outline-variant/30 rounded-2xl outline-none focus:border-nb-primary focus:ring-4 focus:ring-nb-primary/10 transition-all font-medium"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-nb-on-surface-variant/40">
              <p className="text-sm font-bold tracking-widest">No resources found</p>
            </div>
          ) : (
            <div className="grid gap-1">
              {filtered.map(res => (
                <button
                  key={`${res.id}-${res.type}`}
                  onClick={() => onSelect(res.id, res.title, res.type)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-nb-primary/5 group transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-nb-surface-mid flex items-center justify-center text-nb-on-surface-variant group-hover:bg-nb-primary group-hover:text-white transition-all shrink-0">
                    {getIcon(res.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black tracking-widest text-nb-primary/60">{res.type}</span>
                      <span className="text-[10px] font-black tracking-widest text-nb-on-surface-variant/30">•</span>
                      <span className="text-[10px] font-bold text-nb-on-surface-variant/60">{res.entryDate}</span>
                    </div>
                    <h3 className="font-bold text-nb-on-surface group-hover:text-nb-primary transition-colors truncate">{res.title}</h3>
                    <p className="text-xs text-nb-on-surface-variant/60 truncate">In: {res.entryTitle}</p>
                  </div>
                  <div className="text-[10px] font-mono text-nb-on-surface-variant/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    {res.id.slice(0, 8)}...
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
