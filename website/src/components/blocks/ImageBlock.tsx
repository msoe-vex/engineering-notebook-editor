"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

interface ImageContent {
  src: string; // The filename or base64
  caption: string;
  initials: string;
}

export default function ImageBlock({ content, onChange, onImageUpload }: { 
  content: ImageContent, 
  onChange: (content: ImageContent) => void,
  onImageUpload?: (path: string, base64: string) => void
}) {
  const [localSrc, setLocalSrc] = useState(content.src);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setLocalSrc(base64);
      
      // Notify parent to save the actual file bytes
      if (onImageUpload) {
        // Strip data:image/png;base64, prefix
        const rawBase64 = base64.split(',')[1];
        onImageUpload(`notebook/resources/${file.name}`, rawBase64);
      }
      
      onChange({ ...content, src: file.name }); 
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-3 p-2">
      {localSrc ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
             src={localSrc.startsWith('data:') ? localSrc : `/notebook/resources/${localSrc}`} 
             alt={content.caption} 
             className="max-h-[300px] mx-auto rounded border dark:border-zinc-700"
             onError={(e) => {
                 // If not found, show placeholder
                 (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Image+Not+Found';
             }}
          />
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed dark:border-zinc-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition">
          <ImageIcon className="text-gray-400 mb-2" size={32} />
          <span className="text-sm text-gray-500">Click to upload image</span>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
      )}

      <div className="flex gap-4">
        <input 
          type="text"
          placeholder="Figure caption..."
          className="flex-1 bg-transparent border-b dark:border-zinc-800 focus:border-blue-500 outline-none p-1 text-sm"
          value={content.caption}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
        />
        <input 
          type="text"
          placeholder="Initials"
          className="w-20 bg-transparent border-b dark:border-zinc-800 focus:border-blue-500 outline-none p-1 text-sm text-center"
          value={content.initials}
          onChange={(e) => onChange({ ...content, initials: e.target.value })}
        />
      </div>
    </div>
  );
}
