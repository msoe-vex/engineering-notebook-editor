import React, { useState, useRef, useEffect } from "react";

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={className}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul
          className={`absolute z-50 left-0 mt-2 w-max min-w-[140px] max-w-[300px] max-h-48 overflow-y-auto bg-nb-surface border border-nb-outline-variant/30 rounded shadow-xl py-1 text-left ${dropdownClassName}`}
        >
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
        </ul>
      )}
    </div>
  );
}
