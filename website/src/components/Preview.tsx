"use client";
import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Loader2, ZoomIn, ZoomOut, FileText } from "lucide-react";

// Set up worker using the version from the package
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}

interface PreviewProps {
  latexContent: string;
  pdfUrl?: string;
}

export default function Preview({ latexContent, pdfUrl }: PreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (rawCodeRef.current && !pdfUrl) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent, pdfUrl]);

  // Handle Ctrl + Wheel for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY;
        setScale(s => {
          const newScale = s - delta * 0.001; // Slower, smoother zoom
          return Math.min(3.0, Math.max(0.1, newScale));
        });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);


  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput("1");
  }

  // Update current page number based on scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!numPages) return;
    const container = e.currentTarget;
    const pageElements = container.querySelectorAll('[data-page-number]');

    let currentPage = 1;
    let minDistance = Infinity;

    pageElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - container.getBoundingClientRect().top);
      if (distance < minDistance) {
        minDistance = distance;
        currentPage = parseInt(el.getAttribute('data-page-number') || '1');
      }
    });

    if (currentPage !== pageNumber) {
      setPageNumber(currentPage);
      setPageInput(currentPage.toString());
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    jumpToPage(pageInput);
  };

  const jumpToPage = (target: string) => {
    const p = parseInt(target);
    if (isNaN(p) || p < 1 || (numPages && p > numPages)) {
      setPageInput(pageNumber.toString());
      return;
    }

    const container = scrollRef.current;
    const pageEl = container?.querySelector(`[data-page-number="${p}"]`) as HTMLElement;

    if (container && pageEl) {
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const scrollTarget = pageRect.top - containerRect.top + container.scrollTop - 24;

      // Custom fast smooth scroll
      const start = container.scrollTop;
      const change = scrollTarget - start;
      const duration = 400; // Faster than default smooth scroll
      let startTime: number | null = null;

      const animateScroll = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percent = Math.min(progress / duration, 1);

        // Easing function: easeOutCubic
        const ease = 1 - Math.pow(1 - percent, 3);

        container.scrollTop = start + change * ease;

        if (progress < duration) {
          requestAnimationFrame(animateScroll);
        }
      };

      requestAnimationFrame(animateScroll);

      setPageNumber(p);
      setPageInput(p.toString());
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-nb-bg transition-colors duration-300 overflow-hidden relative group">
      {pdfUrl && numPages && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-1.5 bg-nb-surface/80 backdrop-blur-md border border-nb-outline-variant/30 rounded-2xl shadow-nb-lg animate-in slide-in-from-top-4 duration-500 transition-opacity whitespace-nowrap min-w-max opacity-100 lg:opacity-0 lg:group-hover:opacity-100`}>
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 px-3 py-1 whitespace-nowrap">
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onBlur={() => jumpToPage(pageInput)}
              className="w-10 h-6 bg-nb-surface-low border border-nb-outline-variant/30 rounded-md text-[10px] font-black text-center text-nb-on-surface focus:outline-none focus:border-nb-primary/50 transition-colors"
            />
            <span className="text-[10px] font-black tracking-widest uppercase text-nb-on-surface-variant/40">
              of {numPages}
            </span>
          </form>
          <div className="w-px h-4 bg-nb-outline-variant/30 mx-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale(s => Math.max(0.1, s - 0.1))}
              className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface transition-colors cursor-pointer"
              title="Zoom Out (Ctrl+Wheel)"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => setScale(s => Math.min(3.0, s + 0.1))}
              className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface transition-colors cursor-pointer"
              title="Zoom In (Ctrl+Wheel)"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => setScale(1.0)}
              className="px-2 py-1 text-[10px] font-black text-nb-on-surface-variant hover:text-nb-on-surface transition-colors cursor-pointer min-w-[45px]"
              title="Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {pdfUrl ? (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-auto bg-nb-surface-low/50 custom-scrollbar py-8"
          >
            <div className="flex flex-col items-center min-w-min mx-auto w-fit px-4 md:px-8">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <Loader2 size={32} className="animate-spin-stable text-nb-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant">Rendering PDF...</span>
                  </div>
                }
                error={
                  <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
                    <div className="w-16 h-16 rounded-2xl bg-nb-error/10 flex items-center justify-center text-nb-error">
                      <FileText size={32} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-nb-on-surface">Failed to load PDF</h4>
                      <p className="text-xs text-nb-on-surface-variant max-w-[200px]">There was an error displaying the document.</p>
                    </div>
                  </div>
                }
              >
                {Array.from(new Array(numPages || 0), (el, index) => (
                  <div
                    key={`page_${index + 1}`}
                    data-page-number={index + 1}
                    className="mb-8 shadow-nb-2xl rounded-sm overflow-hidden bg-white transition-all duration-300 origin-top"
                  >
                    <Page
                      pageNumber={index + 1}
                      scale={scale}
                      width={1000} // High-quality stable width for instant resizing
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                      devicePixelRatio={typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio) : 1}
                      className="max-w-full h-auto !bg-transparent"
                    />
                  </div>
                ))}
              </Document>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-8 custom-scrollbar relative">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            <pre className="whitespace-pre-wrap !bg-transparent !m-0 !p-0 text-[12px] leading-[1.8] font-mono text-nb-on-surface relative z-10">
              <code ref={rawCodeRef} className="language-latex !bg-transparent !p-0">
                {latexContent}
              </code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}



