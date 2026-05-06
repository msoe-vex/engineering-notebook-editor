import React, { useState, useEffect, useMemo } from "react";
import { X, ExternalLink, Link2Off } from "lucide-react";
import { extractResources, NotebookMetadata, EntryMetadata } from "@/lib/metadata";

interface LinkReferencePopupProps {
  editor: import("@tiptap/react").Editor;
  onClose: () => void;
  metadata?: NotebookMetadata;
  filename?: string;
  showLinkPopup: boolean;
}

export function LinkReferencePopup({
  editor,
  onClose,
  metadata,
  filename,
  showLinkPopup
}: LinkReferencePopupProps) {
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [selectedResource, setSelectedResource] = useState<{ id: string, title: string, type: string, entryTitle?: string, entryDate?: string, entryId?: string } | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
            const entryDate = e.createdAt?.split('T')[0];
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
      const entryDate = e.createdAt?.split('T')[0];

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
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allResources.filter(r =>
      (r.title || "").toLowerCase().includes(q) ||
      (r.entryTitle || "").toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allResources, query]);

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
      const marks: import("@tiptap/pm/model").Mark[] = [editor.schema.marks.underline.create()];
      if (finalLink) {
        marks.push(editor.schema.marks.link.create({ href: finalLink, resourceId, entryId }));
      }

      editor.chain()
        .focus()
        .insertContent({
          type: 'text',
          text: trimmedText || finalLink,
          marks: marks.map(m => m.toJSON())
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().unsetMark('underline').run();
    }
    onClose();
  };

  const rect = editor.view.coordsAtPos(editor.state.selection.from);

  return (
    <div
      className="fixed z-[1000] w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl p-5 animate-in zoom-in-95 fade-in duration-200"
      style={{
        top: Math.min(window.innerHeight - 400, rect.bottom + 10),
        left: Math.min(window.innerWidth - 350, rect.left)
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black tracking-widest text-nb-secondary">Insert Link/Reference</span>
        <button onClick={onClose} className="p-1.5 hover:bg-nb-surface-low rounded-lg transition-colors"><X size={16} /></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-nb-on-surface-variant/50 mb-1.5">Display Text</label>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full px-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-sm focus:border-nb-primary transition-all"
            placeholder="Text to display..."
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-nb-on-surface-variant/50 mb-1.5">Link or Resource</label>
          <div className="relative">
            <input
              type="text"
              value={selectedResource ? selectedResource.title : link}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={e => {
                setLink(e.target.value);
                setSelectedResource(null);
                setQuery(e.target.value);
              }}
              className="w-full px-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-sm focus:border-nb-primary transition-all"
              placeholder="URL or search resource..."
            />
            {isSearchFocused && query && !selectedResource && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-nb-surface border border-nb-outline-variant shadow-nb-lg rounded-lg overflow-hidden z-50 max-h-60 overflow-y-auto scrollbar-thin">
                {filtered.map(r => (
                  <button
                    key={r.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      setSelectedResource(r);
                      setQuery("");
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-nb-primary/5 transition-colors border-b border-nb-outline-variant/10 last:border-0"
                  >
                    <div className="text-sm font-bold text-nb-on-surface truncate">{r.title}</div>
                    <div className="text-[11px] text-nb-on-surface-variant/60 truncate">
                      {r.type} • {r.entryTitle} • {r.entryDate}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {(selectedResource || link.trim()) && (
            <div className="mt-3 p-3 bg-nb-surface-low border border-nb-outline-variant/20 rounded-xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 duration-200">
              <div className="flex-1 min-w-0">
                <div className={`text-[9px] font-black mb-0.5 tracking-tighter ${link.startsWith('#') && !selectedResource ? "text-amber-500" : "text-nb-primary"}`}>
                  {selectedResource ? "Linked Resource" : (link.startsWith('#') ? "Broken Resource" : "External Link")}
                </div>
                <div className={`text-sm font-bold truncate ${link.startsWith('#') && !selectedResource ? "text-amber-600" : "text-nb-on-surface"}`}>
                  {selectedResource ? selectedResource.title : link}
                </div>
                {selectedResource && (
                  <div className="text-[11px] text-nb-on-surface-variant/60 truncate">
                    {selectedResource.type} • {selectedResource.entryTitle} • {selectedResource.entryDate}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (link.startsWith('#') && !selectedResource) return;
                  let url = "";
                  if (selectedResource) {
                    const params = new URLSearchParams(window.location.search);
                    params.set('entry', selectedResource.entryId!);
                    params.set('resource', selectedResource.id);
                    url = `?${params.toString()}`;
                  } else {
                    url = link.trim();
                    if (url && !url.startsWith('#')) {
                      const hasProtocol = /^[a-z]+:/i.test(url);
                      const isDomain = url.includes('.') && !url.includes(' ');
                      if (!hasProtocol && isDomain) url = `https://${url}`;
                    }
                  }
                  window.open(url, '_blank');
                }}
                disabled={link.startsWith('#') && !selectedResource}
                title={link.startsWith('#') && !selectedResource ? "Broken Reference" : "Go to Link"}
                className={`p-2 rounded-lg transition-colors shrink-0 border border-nb-outline-variant/30 shadow-sm ${link.startsWith('#') && !selectedResource
                  ? "bg-nb-surface-low text-nb-on-surface-variant/20 cursor-not-allowed"
                  : "bg-nb-surface text-nb-primary hover:bg-nb-primary/10"
                  }`}
              >
                <ExternalLink size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 bg-nb-primary text-white text-[11px] font-bold tracking-widest rounded-lg hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
          >
            Apply Link
          </button>

          {editor.isActive('link') && (
            <button
              onClick={() => { editor.chain().focus().unsetLink().unsetMark('underline').run(); onClose(); }}
              title="Remove Link"
              className="px-3 py-2 bg-nb-surface-low text-red-500 rounded-lg hover:bg-red-50 transition-all border border-nb-outline-variant/30"
            >
              <Link2Off size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
