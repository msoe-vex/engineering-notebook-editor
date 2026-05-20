import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  ExternalLink,
  Link2Off,
  FileText,
  Image as ImageIcon,
  Table,
  Code,
  Heading,
  Filter,
  Search
} from "lucide-react";
import { extractResources, NotebookMetadata, EntryMetadata } from "@/lib/metadata";

interface LinkReferencePopupProps {
  editor: import("@tiptap/react").Editor;
  onClose: () => void;
  metadata?: NotebookMetadata;
  filename?: string;
  showLinkPopup: boolean;
  isMention?: boolean;
}

export function LinkReferencePopup({
  editor,
  onClose,
  metadata,
  filename,
  showLinkPopup,
  isMention
}: LinkReferencePopupProps) {
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [selectedResource, setSelectedResource] = useState<{ id: string, title: string, type: string, entryTitle?: string, entryDate?: string, entryId?: string } | null>(null);
  
  // Filters
  const [resourceType, setResourceType] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when opening
  useEffect(() => {
    if (showLinkPopup && !selectedResource) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showLinkPopup, selectedResource]);

  const getResourceTypeLabel = (type: string) => {
    const normalizedType = (type || "").trim();
    const labels: Record<string, string> = {
      entry: "Entry",
      image: "Image",
      table: "Table",
      codeBlock: "Code Block",
      header: "Header",
      heading: "Header",
    };

    if (labels[normalizedType]) {
      return labels[normalizedType];
    }

    return normalizedType
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, ch => ch.toUpperCase());
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case "entry":
        return FileText;
      case "image":
        return ImageIcon;
      case "table":
        return Table;
      case "codeBlock":
        return Code;
      default:
        return Heading;
    }
  };

  const getResourceColorClass = (type: string) => {
    switch (type) {
      case "entry":
        return { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-500" };
      case "image":
        return { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-500" };
      case "table":
        return { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-500" };
      case "codeBlock":
        return { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-500" };
      default:
        return { bg: "bg-pink-500/10", border: "border-pink-500/20", text: "text-pink-500" };
    }
  };

  useEffect(() => {
    const init = async () => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ");
      setText(selectedText);

      if (editor.isActive('link')) {
        const attrs = editor.getAttributes('link');
        setLink(attrs.href || "");
        if (attrs.resourceId) {
          let found = null;
          for (const entry of Object.values(metadata?.entries || {})) {
            const e = entry as EntryMetadata;
            const entryTitle = e.title?.trim() || "Untitled Entry";
            const entryDate = e.date || e.createdAt?.split('T')[0];
            if (e.id === attrs.resourceId) {
              found = { id: e.id, title: e.title, type: 'entry', entryTitle, entryDate };
              break;
            }
            if (e.resources?.[attrs.resourceId]) {
              found = { id: attrs.resourceId, entryId: e.id, ...e.resources[attrs.resourceId], entryTitle, entryDate };
              break;
            }
          }
          if (found) setSelectedResource(found);
        }
      }
    };
    if (showLinkPopup) init();
  }, [editor, metadata, showLinkPopup]);

  const allResources = useMemo(() => {
    const list: { id: string, title: string, type: string, entryTitle?: string, entryDate?: string, entryId?: string }[] = [];
    if (!metadata || !metadata.entries) return list;

    const currentEntryId = (editor.options.element as HTMLElement).closest('[data-filename]')?.getAttribute('data-filename')?.split('/').pop()?.replace('.json', '')
      || filename?.split('/').pop()?.replace('.json', '');

    const localResources = extractResources(editor.getJSON());

    for (const [entryId, entry] of Object.entries(metadata.entries)) {
      const e = entry as EntryMetadata;
      const entryTitle = e.title?.trim() || "Untitled Entry";
      const entryDate = e.date || e.createdAt?.split('T')[0];

      list.push({ id: entryId, title: entryTitle, type: "entry", entryTitle, entryDate, entryId });

      const resources = (entryId === currentEntryId) ? { ...e.resources, ...localResources } : (e.resources || {});

      for (const [resourceId, res] of Object.entries(resources)) {
        const r = res as { title: string, caption: string, type: string };
        const resTitle = r.title?.trim() || `Untitled ${r.type?.charAt(0).toUpperCase() + r.type?.slice(1) || 'Block'}`;
        list.push({ id: resourceId, title: resTitle, type: r.type, entryTitle, entryDate, entryId });
      }
    }
    return list;
  }, [metadata, editor, filename]);

  const filtered = useMemo(() => {
    let list = allResources;

    // Filter by type
    if (resourceType !== "all") {
      list = list.filter(r => r.type === resourceType);
    }

    // Filter by date
    if (startDate) {
      const start = new Date(startDate);
      list = list.filter(r => {
        if (!r.entryDate) return false;
        return new Date(r.entryDate) >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      list = list.filter(r => {
        if (!r.entryDate) return false;
        return new Date(r.entryDate) <= end;
      });
    }

    // Filter by text query
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(r =>
        (r.title || "").toLowerCase().includes(q) ||
        (r.entryTitle || "").toLowerCase().includes(q)
      );
    }

    return list.slice(0, 50);
  }, [allResources, resourceType, startDate, endDate, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleApply = () => {
    const trimmedText = text.trim();
    let finalLink = selectedResource ? `#${selectedResource.id}` : link.trim();
    const resourceId = selectedResource?.id;
    const entryId = selectedResource?.entryId;

    if (!selectedResource && finalLink && !finalLink.startsWith('#')) {
      const hasProtocol = /^[a-z]+:/i.test(finalLink);
      const isDomain = finalLink.includes('.') && !finalLink.includes(' ');
      if (!hasProtocol && isDomain) {
        finalLink = `https://${finalLink}`;
      }
    }

    if (finalLink || trimmedText) {
      const marks: import("@tiptap/pm/model").Mark[] = [];
      if (finalLink) {
        marks.push(editor.schema.marks.link.create({ href: finalLink, resourceId, entryId, autoStyled: true }));
        marks.push(editor.schema.marks.underline.create());
        marks.push(editor.schema.marks.textStyle.create({ color: '#3b82f6' }));
      }

      if (isMention) {
        const { from } = editor.state.selection;
        editor.chain().deleteRange({ from: from - 1, to: from }).focus().run();
      }

      editor.chain()
        .focus()
        .insertContent({
          type: 'text',
          text: trimmedText || (finalLink.startsWith('#') ? (selectedResource?.title || finalLink) : finalLink),
          marks: marks.map(m => m.toJSON())
        })
        .unsetMark('link')
        .unsetMark('underline')
        .unsetColor()
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().unsetMark('underline').unsetColor().run();
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      <div
        className="w-[360px] max-h-[90vh] bg-nb-surface border border-nb-outline-variant shadow-nb-3xl rounded-2xl p-5 animate-in zoom-in-95 duration-200 flex flex-col overflow-y-auto custom-scrollbar"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black tracking-widest text-nb-secondary uppercase">Insert Link/Reference</span>
          <button onClick={onClose} className="p-1.5 hover:bg-nb-surface-low rounded-lg transition-colors cursor-pointer text-nb-on-surface-variant"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          {/* Display Text Field */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50 mb-1.5">Display Text</label>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-xs focus:border-nb-primary focus:ring-1 focus:ring-nb-primary/20 transition-all font-medium text-nb-on-surface"
              placeholder="Text to display..."
            />
          </div>

          {/* Link / Resource Selector Area */}
          <div className="border-t border-nb-outline-variant/30 pt-3.5">
            {selectedResource ? (
              /* Selected Resource Card */
              <div className="space-y-2">
                <label className="block text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50">Target Resource</label>
                <div className="p-3 bg-nb-surface-low border border-nb-outline-variant/30 rounded-xl flex items-center justify-between gap-3 animate-in zoom-in-95 duration-200">
                  <div className="flex-1 min-w-0 flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg shrink-0 ${getResourceColorClass(selectedResource.type).bg} ${getResourceColorClass(selectedResource.type).text}`}>
                      {React.createElement(getResourceIcon(selectedResource.type), { size: 12 })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[8px] font-black tracking-widest text-nb-primary uppercase mb-0.5">{getResourceTypeLabel(selectedResource.type)}</div>
                      <div className="text-xs font-bold text-nb-on-surface truncate leading-snug">{selectedResource.title}</div>
                      <div className="text-[9px] text-nb-on-surface-variant/60 truncate mt-0.5 font-medium">
                        {selectedResource.entryTitle} • {selectedResource.entryDate}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedResource(null);
                      setQuery("");
                    }}
                    className="p-1.5 hover:bg-red-50 text-nb-on-surface-variant hover:text-red-500 rounded-lg border border-nb-outline-variant/30 transition-all shrink-0 cursor-pointer"
                    title="Clear Selection"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              /* Search, Filters, and List */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50">Link or Search Resource</label>
                  {link.trim() && !link.startsWith("#") && (
                    <div className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <ExternalLink size={8} />
                      <span>External URL detected</span>
                    </div>
                  )}
                </div>
                
                {/* Search Bar */}
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={link}
                    onChange={e => {
                      setLink(e.target.value);
                      setQuery(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-8 pr-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-xs focus:border-nb-primary focus:ring-1 focus:ring-nb-primary/20 transition-all font-medium text-nb-on-surface"
                    placeholder="Paste URL or type to search..."
                  />
                </div>

                {/* Filters Block */}
                <div className="bg-nb-surface-low/30 border border-nb-outline-variant/10 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Filter size={10} className="text-nb-on-surface-variant/50" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-nb-on-surface-variant/60">Filters</span>
                  </div>
                  
                  {/* Resource Type Dropdown */}
                  <div>
                    <select
                      value={resourceType}
                      onChange={e => setResourceType(e.target.value)}
                      className="w-full text-[10px] font-bold px-2 py-1 bg-nb-surface-low border border-nb-outline-variant/20 rounded-md outline-none focus:border-nb-primary transition-all text-nb-on-surface"
                    >
                      <option value="all">All Types</option>
                      <option value="entry">Entries</option>
                      <option value="image">Images</option>
                      <option value="table">Tables</option>
                      <option value="codeBlock">Code Blocks</option>
                      <option value="heading">Headers</option>
                    </select>
                  </div>

                  {/* Date Filters Grid */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black uppercase tracking-wider text-nb-on-surface-variant/40">Filter by Date</span>
                      {(startDate || endDate) && (
                        <button
                          onClick={() => { setStartDate(""); setEndDate(""); }}
                          className="text-[8px] font-black uppercase text-red-500 hover:underline tracking-wider"
                        >
                          Reset Dates
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className="w-full text-[9px] font-medium p-1 bg-nb-surface-low border border-nb-outline-variant/20 rounded-md outline-none focus:border-nb-primary transition-all text-nb-on-surface"
                        />
                      </div>
                      <div>
                        <input
                          type="date"
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          className="w-full text-[9px] font-medium p-1 bg-nb-surface-low border border-nb-outline-variant/20 rounded-md outline-none focus:border-nb-primary transition-all text-nb-on-surface"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scrollable List */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50">Matching Options ({filtered.length})</span>
                  </div>
                  <div className="h-[150px] overflow-y-auto border border-nb-outline-variant/20 rounded-xl bg-nb-surface-low/50 p-1.5 space-y-1 custom-scrollbar">
                    {filtered.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4">
                        <span className="text-[10px] font-bold text-nb-on-surface-variant/30">No resources found</span>
                      </div>
                    ) : (
                      filtered.map(r => {
                        const Icon = getResourceIcon(r.type);
                        const colorClass = getResourceColorClass(r.type);
                        return (
                          <button
                            key={r.id}
                            onClick={() => setSelectedResource(r)}
                            className="w-full text-left p-2 rounded-lg hover:bg-nb-primary/5 border border-transparent hover:border-nb-primary/10 transition-all flex items-start gap-2.5 group cursor-pointer"
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${colorClass.bg} ${colorClass.text}`}>
                              <Icon size={10} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-nb-on-surface group-hover:text-nb-primary transition-colors truncate leading-tight">{r.title}</div>
                              <div className="text-[9px] font-medium text-nb-on-surface-variant/40 truncate mt-0.5">
                                {r.entryTitle} • {r.entryDate}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-2 pt-2 border-t border-nb-outline-variant/30">
            <button
              onClick={handleApply}
              className="flex-1 py-2.5 bg-nb-primary text-white text-[10px] font-bold tracking-widest uppercase rounded-lg hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 cursor-pointer"
            >
              Apply Link
            </button>

            {editor.isActive('link') && (
              <button
                onClick={() => { editor.chain().focus().unsetLink().unsetMark('underline').unsetColor().run(); onClose(); }}
                title="Remove Link"
                className="px-3 py-2 bg-nb-surface-low text-red-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all border border-nb-outline-variant/30 cursor-pointer"
              >
                <Link2Off size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
