import { useSyncExternalStore } from "react";

/** Tailwind `md` — phone / small tablet portrait. */
export const NARROW_VIEWPORT_MQ = "(max-width: 767px)";

function subscribeNarrowViewport(onChange: () => void) {
  const mq = window.matchMedia(NARROW_VIEWPORT_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when viewport is below the `md` breakpoint (layout, not UA). */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(
    subscribeNarrowViewport,
    () => window.matchMedia(NARROW_VIEWPORT_MQ).matches,
    () => false
  );
}

/**
 * Checks whether the current environment is a mobile or touch-primary device
 * using interaction media queries, User-Agent Client Hints, and user-agent fallbacks.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  // 1. User-Agent Data (Chromium standard)
  if (typeof navigator !== "undefined" && "userAgentData" in navigator) {
    const uad = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (typeof uad?.mobile === "boolean") {
      return uad.mobile;
    }
  }

  // 2. Interaction media queries (Touchscreen as primary input and no hover)
  try {
    const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const lacksHover = window.matchMedia("(hover: none)").matches;
    if (hasCoarsePointer && lacksHover) {
      return true;
    }
  } catch {
    // Ignore matchMedia errors in unsupported environments
  }

  // 3. User-Agent fallback (iOS / Safari / Firefox Mobile)
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return isMobileUA || isIPadOS;
}

const emptySubscribe = () => () => {};

/**
 * React hook to reactively check if the current device is a mobile device.
 * Defaults to false during SSR to avoid hydration mismatches.
 */
export function useIsMobileDevice(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    isMobileDevice,
    () => false
  );
}
