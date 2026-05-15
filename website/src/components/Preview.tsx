"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import { Document, Page, pdfjs } from 'react-pdf';
import type { PageProps } from 'react-pdf';
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

const clampScale = (s: number) => Math.min(3.0, Math.max(0.1, s));

export default function Preview({ latexContent, pdfUrl }: PreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

  // Current scale ref + target scale the animation chases
  const scaleRef = useRef(1.0);
  const targetScaleRef = useRef(1.0);
  const contentHeightRef = useRef(0);
  const zoomAnimRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const lastKnownScrollTopRef = useRef(0);
  const lastKnownScrollLeftRef = useRef(0);

  const cancelAllAnimations = useCallback(() => {
    if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    zoomAnimRef.current = null;
    scrollAnimRef.current = null;
    isAnimatingRef.current = false;
    isScrollAnimatingRef.current = false;
  }, []);

  // Synchronously update DOM elements + scaleRef. setScale is async (for % display only).
  const applyScaleToDOM = (s: number) => {
    scaleRef.current = s;
    if (sizerRef.current) {
      sizerRef.current.style.width = `${1000 * s}px`;
      if (contentHeightRef.current > 0) {
        sizerRef.current.style.height = `${contentHeightRef.current * s}px`;
      }
    }
    if (transformRef.current) {
      transformRef.current.style.transform = `scale(${s})`;
    }
    setScale(s);
  };

  // Measure unscaled content height so the sizer wrapper can create correct scroll area
  useEffect(() => {
    if (!contentRef.current || !numPages) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0].target.scrollHeight;
      contentHeightRef.current = h;
      // Update sizer with current scale
      if (sizerRef.current) {
        sizerRef.current.style.height = `${h * scaleRef.current}px`;
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [numPages]);

  // Smooth scroll: target-chasing animation for regular wheel scrolling (both axes)
  const targetScrollTopRef = useRef(0);
  const targetScrollLeftRef = useRef(0);
  const scrollAnimRef = useRef<number | null>(null);
  const isScrollAnimatingRef = useRef(false);

  const ensureScrollAnimationRunning = useCallback(() => {
    if (isScrollAnimatingRef.current) return;
    isScrollAnimatingRef.current = true;

    const step = () => {
      const container = scrollRef.current;
      if (!container) {
        isScrollAnimatingRef.current = false;
        scrollAnimRef.current = null;
        return;
      }

      const curTop = container.scrollTop;
      const targetTop = targetScrollTopRef.current;
      const diffTop = targetTop - curTop;

      const curLeft = container.scrollLeft;
      const targetLeft = targetScrollLeftRef.current;
      const diffLeft = targetLeft - curLeft;

      // Snap when close enough on both axes
      if (Math.abs(diffTop) < 0.5 && Math.abs(diffLeft) < 0.5) {
        container.scrollTop = targetTop;
        container.scrollLeft = targetLeft;
        lastKnownScrollTopRef.current = container.scrollTop;
        lastKnownScrollLeftRef.current = container.scrollLeft;
        isScrollAnimatingRef.current = false;
        scrollAnimRef.current = null;
        return;
      }

      // Exponential decay: move 18% of remaining distance each frame
      const nextTop = curTop + diffTop * 0.18;
      const nextLeft = curLeft + diffLeft * 0.18;
      
      container.scrollTop = nextTop;
      container.scrollLeft = nextLeft;
      lastKnownScrollTopRef.current = container.scrollTop;
      lastKnownScrollLeftRef.current = container.scrollLeft;
      
      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);
  }, []);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => cancelAllAnimations();
  }, [cancelAllAnimations]);

  // Single animation loop: smoothly interpolates current scale toward targetScaleRef.
  // Uses exponential decay (lerp) so it naturally handles retargeting mid-animation —
  // new inputs just move the target and the animation chases it.
  // All DOM mutations are synchronous (via refs), so scroll adjustment never gets
  // clamped by stale sizer dimensions.
  const ensureAnimationRunning = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const step = () => {
      const current = scaleRef.current;
      const target = targetScaleRef.current;
      const diff = target - current;

      // Snap when close enough
      if (Math.abs(diff) < 0.002) {
        applyScaleToDOM(target);
        isAnimatingRef.current = false;
        zoomAnimRef.current = null;
        return;
      }

      // Exponential decay: move 18% of remaining distance each frame
      const newScale = current + diff * 0.18;
      const ratio = newScale / current;

      // 1. Update sizer + transform DOM synchronously FIRST
      applyScaleToDOM(newScale);

      // 2. Now adjust scroll — sizer is already the correct size, so no clamping
      const container = scrollRef.current;
      if (container) {
        // Vertical: keep same content at viewport center
        const vCenter = container.scrollTop + container.clientHeight / 2;
        container.scrollTop = vCenter * ratio - container.clientHeight / 2;

        // Horizontal: keep centered (proportional)
        const hCenter = container.scrollLeft + container.clientWidth / 2;
        container.scrollLeft = hCenter * ratio - container.clientWidth / 2;

        // Scale smooth scroll targets by the same ratio so they move with content
        targetScrollTopRef.current *= ratio;
        targetScrollLeftRef.current *= ratio;
        
        lastKnownScrollTopRef.current = container.scrollTop;
        lastKnownScrollLeftRef.current = container.scrollLeft;
      }

      zoomAnimRef.current = requestAnimationFrame(step);
    };

    zoomAnimRef.current = requestAnimationFrame(step);
  }, []);

  // Unified zoom function — all zoom sources call this
  const zoomTo = useCallback((newTarget: number) => {
    targetScaleRef.current = clampScale(newTarget);
    ensureAnimationRunning();
  }, [ensureAnimationRunning]);

  useEffect(() => {
    if (rawCodeRef.current && !pdfUrl) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent, pdfUrl]);

  // Handle wheel events: Ctrl+Wheel = zoom, regular wheel = smooth scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        zoomTo(targetScaleRef.current - e.deltaY * 0.0015);
      } else if (scrollRef.current) {
        // Smooth scroll
        e.preventDefault();
        const container = scrollRef.current;
        
        if (e.shiftKey) {
          // Horizontal smooth scroll
          const maxScrollX = container.scrollWidth - container.clientWidth;
          targetScrollLeftRef.current = Math.max(0, Math.min(maxScrollX, targetScrollLeftRef.current + e.deltaY));
        } else {
          // Vertical smooth scroll
          const maxScrollY = container.scrollHeight - container.clientHeight;
          targetScrollTopRef.current = Math.max(0, Math.min(maxScrollY, targetScrollTopRef.current + e.deltaY));
        }
        
        ensureScrollAnimationRunning();
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
  }, [zoomTo, ensureScrollAnimationRunning]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput("1");
  }

  // Update current page number based on scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!numPages) return;
    const container = e.currentTarget;

    const curTop = container.scrollTop;
    const curLeft = container.scrollLeft;

    // Detect manual scrollbar drag or mouse wheel bypass
    const isManual = Math.abs(curTop - lastKnownScrollTopRef.current) > 1.0 || 
                     Math.abs(curLeft - lastKnownScrollLeftRef.current) > 1.0;

    if (isManual) {
      cancelAllAnimations();
      targetScrollTopRef.current = curTop;
      targetScrollLeftRef.current = curLeft;
    }
    
    lastKnownScrollTopRef.current = curTop;
    lastKnownScrollLeftRef.current = curLeft;

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
    pageInputRef.current?.blur();
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

      // Custom fast smooth scroll with easeOutCubic
      const start = container.scrollTop;
      const change = scrollTarget - start;
      const duration = 400;
      let startTime: number | null = null;

      const animateScroll = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percent = Math.min(progress / duration, 1);
        const ease = 1 - Math.pow(1 - percent, 3);

        container.scrollTop = start + change * ease;
        lastKnownScrollTopRef.current = container.scrollTop;

        if (progress < duration) {
          requestAnimationFrame(animateScroll);
        }
      };

      requestAnimationFrame(animateScroll);

      // Sync smooth scroll target so wheel doesn't fight jump animation
      targetScrollTopRef.current = scrollTarget;

      setPageNumber(p);
      setPageInput(p.toString());
    }
  };

  // Zoom button handlers — all go through the unified zoomTo
  const zoomIn = () => zoomTo(scaleRef.current + 0.1);
  const zoomOut = () => zoomTo(scaleRef.current - 0.1);
  const zoomReset = () => zoomTo(1.0);

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-nb-bg transition-colors duration-300 overflow-hidden relative group">
      {pdfUrl && numPages && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-1.5 bg-nb-surface/80 backdrop-blur-md border border-nb-outline-variant/30 rounded-2xl shadow-nb-lg animate-in slide-in-from-top-4 duration-500 transition-opacity whitespace-nowrap min-w-max opacity-100 lg:opacity-0 lg:group-hover:opacity-100`}>
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 px-3 py-1 whitespace-nowrap">
            <input
              ref={pageInputRef}
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
              onClick={zoomOut}
              className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface transition-colors cursor-pointer"
              title="Zoom Out (Ctrl+Wheel)"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={zoomIn}
              className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface transition-colors cursor-pointer"
              title="Zoom In (Ctrl+Wheel)"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={zoomReset}
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
            <div className="min-w-full w-fit mx-auto px-4 md:px-8">
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
                {/* Sizer wrapper: dimensions driven by refs for flicker-free animation */}
                <div
                  ref={sizerRef}
                  style={{
                    width: `${1000 * scale}px`,
                    height: contentHeightRef.current > 0 ? `${contentHeightRef.current * scale}px` : 'auto',
                    margin: '0 auto',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Transform wrapper: scale driven by ref for flicker-free animation */}
                  <div
                    ref={transformRef}
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
              if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                if (!pdfUrl && rawCodeRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  const range = document.createRange();
                  range.selectNodeContents(rawCodeRef.current);
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                }
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
