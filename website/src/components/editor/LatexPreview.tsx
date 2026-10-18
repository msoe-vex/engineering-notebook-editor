"use client";
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import { Document, Page, pdfjs } from 'react-pdf';
import type { PageProps } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Loader2, ZoomIn, ZoomOut, FileText, ChevronLeft, ChevronRight } from "lucide-react";

// Set up worker using the version from the package
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}

interface LatexPreviewProps {
  latexContent: string;
  pdfUrl?: string;
}

const clampScale = (s: number) => Math.min(3.0, Math.max(0.1, s));

export default function LatexPreview({ latexContent, pdfUrl }: LatexPreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.0);
  const [scaleInput, setScaleInput] = useState("100");
  const [contentHeight, setContentHeight] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const scaleInputRef = useRef<HTMLInputElement>(null);
  const pendingZoomAdjustment = useRef<{ scrollTop: number; scrollLeft: number } | null>(null);

  // Sync zoom percentage input with current scale
  useEffect(() => {
    setScaleInput(String(Math.round(scale * 100)));
  }, [scale]);

  // Measure unscaled content height to drive the sizer wrapper
  useEffect(() => {
    if (!contentRef.current || !numPages) return;
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0].target.scrollHeight);
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [numPages]);

  // Handle scroll anchoring during zoom
  useLayoutEffect(() => {
    if (pendingZoomAdjustment.current && scrollRef.current) {
      const { scrollTop, scrollLeft } = pendingZoomAdjustment.current;
      scrollRef.current.scrollTop = scrollTop;
      scrollRef.current.scrollLeft = scrollLeft;
      pendingZoomAdjustment.current = null;
    }
  }, [scale]);

  // Initial centering
  useEffect(() => {
    if (numPages && scrollRef.current) {
      const container = scrollRef.current;
      let attempts = 0;
      const center = () => {
        const maxScrollX = container.scrollWidth - container.clientWidth;
        if (maxScrollX > 0) {
          container.scrollLeft = maxScrollX / 2;
        } else if (attempts < 10) {
          attempts++;
          requestAnimationFrame(center);
        }
      };
      requestAnimationFrame(center);
    }
  }, [numPages]);

  const zoomTo = useCallback((newTarget: number) => {
    const target = clampScale(newTarget);
    const container = scrollRef.current;
    
    if (container) {
      const ratio = target / scale;
      const vCenter = container.scrollTop + container.clientHeight / 2;
      const hCenter = container.scrollLeft + container.clientWidth / 2;
      
      pendingZoomAdjustment.current = {
        scrollTop: vCenter * ratio - container.clientHeight / 2,
        scrollLeft: hCenter * ratio - container.clientWidth / 2
      };
    }
    
    setScale(target);
  }, [scale]);

  useEffect(() => {
    if (rawCodeRef.current && !pdfUrl) {
      // For very large documents, syntax highlighting can be a performance bottleneck
      if (latexContent.length > 50000) {
        rawCodeRef.current.textContent = latexContent;
        return;
      }
      
      const timer = setTimeout(() => {
        if (rawCodeRef.current) Prism.highlightElement(rawCodeRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [latexContent, pdfUrl]);

  // Handle wheel events for zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        zoomTo(scale - e.deltaY * 0.0015);
      }
    };

    const container = scrollRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [zoomTo, scale]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput("1");
  }

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

  const jumpToPage = (target: string | number) => {
    const p = typeof target === "number" ? target : parseInt(target);
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
      container.scrollTop = scrollTarget;
      setPageNumber(p);
      setPageInput(p.toString());
    }
  };

  const prevPage = () => jumpToPage(pageNumber - 1);
  const nextPage = () => jumpToPage(pageNumber + 1);

  const zoomIn = () => zoomTo(scale + 0.1);
  const zoomOut = () => zoomTo(scale - 0.1);
  const zoomReset = () => zoomTo(1.0);

  const applyScaleInput = (val: string) => {
    const parsed = parseFloat(val.replace(/%/g, "").trim());
    if (isNaN(parsed) || parsed <= 0) {
      setScaleInput(String(Math.round(scale * 100)));
      return;
    }
    zoomTo(parsed / 100);
  };

  return (
    <div className="flex flex-col h-full bg-nb-bg transition-colors duration-300 overflow-hidden relative">
      {pdfUrl && numPages && (
        <div className="flex shrink-0 items-center justify-between border-b border-nb-outline-variant/20 bg-nb-surface px-3 py-1.5 text-xs text-nb-on-surface sm:justify-center sm:gap-6">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevPage}
              disabled={pageNumber <= 1}
              aria-label="Previous page"
              className="rounded-md p-1 text-nb-on-surface transition-colors hover:bg-nb-surface-low disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                jumpToPage(pageInput);
                pageInputRef.current?.blur();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                ref={pageInputRef}
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => jumpToPage(pageInput)}
                aria-label="Page number"
                className="h-6 w-10 rounded-md border border-nb-outline-variant/30 bg-nb-surface-low text-center text-xs font-semibold text-nb-on-surface transition-colors focus:border-nb-primary/50 focus:outline-none"
              />
              <span className="text-xs font-medium text-nb-on-surface-variant">
                / {numPages}
              </span>
            </form>
            <button
              type="button"
              onClick={nextPage}
              disabled={!numPages || pageNumber >= numPages}
              aria-label="Next page"
              className="rounded-md p-1 text-nb-on-surface transition-colors hover:bg-nb-surface-low disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="hidden h-4 w-px bg-nb-outline-variant/30 sm:block" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              aria-label="Zoom out"
              className="rounded-md p-1 text-nb-on-surface transition-colors hover:bg-nb-surface-low cursor-pointer"
            >
              <ZoomOut size={16} />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyScaleInput(scaleInput);
                scaleInputRef.current?.blur();
              }}
              className="flex items-center gap-1"
            >
              <input
                ref={scaleInputRef}
                type="text"
                value={scaleInput}
                onChange={(e) => setScaleInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => applyScaleInput(scaleInput)}
                aria-label="Zoom percentage"
                className="h-6 w-11 rounded-md border border-nb-outline-variant/30 bg-nb-surface-low text-center text-xs font-semibold text-nb-on-surface transition-colors focus:border-nb-primary/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={zoomReset}
                title="Reset zoom to 100%"
                aria-label="Reset zoom to 100%"
                className="text-xs font-semibold text-nb-on-surface-variant transition-colors hover:text-nb-on-surface cursor-pointer"
              >
                %
              </button>
            </form>
            <button
              type="button"
              onClick={zoomIn}
              aria-label="Zoom in"
              className="rounded-md p-1 text-nb-on-surface transition-colors hover:bg-nb-surface-low cursor-pointer"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {pdfUrl ? (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-auto bg-nb-surface-low/50 custom-scrollbar"
          >
            <div className="py-8 min-w-full inline-block align-top">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                externalLinkTarget="_blank"
                externalLinkRel="noopener noreferrer"
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
                <div
                  ref={sizerRef}
                  style={{
                    width: `${1000 * scale}px`,
                    height: contentHeight > 0 ? `${contentHeight * scale}px` : 'auto',
                    margin: '0 auto',
                    display: 'block',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      width: '1000px',
                    }}
                  >
                    <div ref={contentRef} className="flex flex-col items-center w-full">
                      {Array.from(new Array(numPages || 0), (el, index) => (
                        <div
                           key={`page_${index + 1}`}
                           data-page-number={index + 1}
                           className="mb-8 shadow-nb-2xl rounded-sm overflow-hidden bg-white"
                        >
                          <Page
                            pageNumber={index + 1}
                            scale={1.0}
                            renderMode={"svg" as PageProps['renderMode']}
                            width={1000}
                            renderAnnotationLayer={true}
                            renderTextLayer={true}
                            className="max-w-full h-auto !bg-transparent"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Document>
            </div>
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto p-8 custom-scrollbar relative focus:outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'a' && rawCodeRef.current) {
                e.preventDefault();
                e.stopPropagation();
                const range = document.createRange();
                range.selectNodeContents(rawCodeRef.current);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
            }}
          >
            <pre className="language-latex whitespace-pre-wrap break-words !m-0 !p-0 text-[14px] leading-[1.8] font-mono text-nb-on-surface relative z-10">
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
