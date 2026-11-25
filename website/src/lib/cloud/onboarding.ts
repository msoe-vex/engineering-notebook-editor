/** Client-only first-run product tour persistence. */

export const ONBOARDING_STORAGE_KEY = "ene:onboarding:v1";
export const ONBOARDING_REPLAY_EVENT = "ene:onboarding-replay";

export type OnboardingState = {
  completedAt?: string;
  dismissedAt?: string;
};

function readRaw(): OnboardingState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return {};
  }
}

export function isOnboardingDone(): boolean {
  const s = readRaw();
  return Boolean(s.completedAt || s.dismissedAt);
}

export function markOnboardingComplete(): void {
  if (typeof window === "undefined") return;
  const next: OnboardingState = { ...readRaw(), completedAt: new Date().toISOString() };
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
}

export function markOnboardingDismissed(): void {
  if (typeof window === "undefined") return;
  const next: OnboardingState = { ...readRaw(), dismissedAt: new Date().toISOString() };
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
}

export function clearOnboardingForReplay(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

export function requestOnboardingReplay(): void {
  clearOnboardingForReplay();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
  }
}
