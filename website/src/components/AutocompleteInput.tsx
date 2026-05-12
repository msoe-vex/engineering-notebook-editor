import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface AutocompleteInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  options: string[];
  onSelectOption: (option: string) => void;
  dropdownClassName?: string;
  wrapperClassName?: string;
}

export default function AutocompleteInput({
  options,
  onSelectOption,
  dropdownClassName = "",
  wrapperClassName = "",
  className = "",
  value,
  onChange,
  ...props
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes((value as string)?.toLowerCase() || "")
  );

  return (
    <div className={`relative ${wrapperClassName}`} ref={containerRef}>
      <input
        {...props}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          updateCoords();
          setIsOpen(true);
        }}
        onFocus={() => {
          updateCoords();
          setIsOpen(true);
        }}
        className={className}
      />
      {isOpen && filteredOptions.length > 0 && createPortal(
        <ul
          style={{
            position: 'fixed',
            top: coords.top + 8,
            left: coords.left,
            width: coords.width,
            zIndex: 9999
          }}
          className={`bg-nb-surface border border-nb-outline-variant/30 rounded shadow-xl py-1 text-left animate-in fade-in slide-in-from-top-1 duration-150 ${dropdownClassName}`}
        >
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.map((opt) => (
              <li
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  onSelectOption(opt);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 text-xs text-nb-on-surface hover:bg-nb-surface-low cursor-pointer transition-colors truncate"
              >
                {opt}
              </li>
            ))}
          </div>
        </ul>,
        document.body
      )}
    </div>
  );
}
