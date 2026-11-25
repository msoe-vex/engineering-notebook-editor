"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@/components/ui";
import {
  ONBOARDING_REPLAY_EVENT,
  isOnboardingDone,
  markOnboardingComplete,
  markOnboardingDismissed,
} from "@/lib/cloud/onboarding";

type Step = {
  id: string;
  title: string;
  body: string;
  /** Optional navigation hint when advancing. */
  href?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to your engineering notebook",
    body: "This short tour covers the cloud product: organizations, notebooks, entries, compile, sharing, and Help. You can skip anytime and replay it from Help.",
  },
  {
    id: "org",
    title: "Organizations",
    body: "Start from Home to create or open an organization. Invites bring teammates in; People and Teams control who can collaborate.",
    href: "/",
  },
  {
    id: "notebook",
    title: "Create a notebook",
    body: "Inside an org, create a notebook for your season or project. Use Setup for title, phases, and who can access it.",
  },
  {
    id: "entry",
    title: "Write entries",
    body: "Use New in the explorer for a blank entry, a blank template, or an entry from a template. Filter by Templates when you need them.",
  },
  {
    id: "editor",
    title: "Editor basics",
    body: "Set title, date, authors, and design phase. Switch Editor / Split / LaTeX on desktop. Images upload to cloud storage and sync with collaborators.",
  },
  {
    id: "compile",
    title: "Compile to PDF",
    body: "Open Compile to run a server XeLaTeX job. Progress shows the current status and percent. Templates, trash, and Hide-from-PDF entries are excluded.",
  },
  {
    id: "share",
    title: "Share & access",
    body: "Share notebooks with people or teams, or publish a public PDF link from Compile. Org public pages are separate from notebook access.",
  },
  {
    id: "help",
    title: "Help anytime",
    body: "Open Help from the header for orgs, editor, compile, GenAI, Judge, and account topics. Replay this tour from Help → Getting Started.",
    href: "/help",
  },
];

export function ProductTour({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const maybeOpen = () => {
      if (!isOnboardingDone()) {
        setStep(0);
        setOpen(true);
      }
    };
    // Defer so home chrome paints first.
    const t = window.setTimeout(maybeOpen, 600);
    const onReplay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
    };
  }, [enabled]);

  if (!enabled || !open) return null;

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step >= STEPS.length - 1;

  function close(dismiss: boolean) {
    if (dismiss) markOnboardingDismissed();
    setOpen(false);
  }

  function finish() {
    markOnboardingComplete();
    setOpen(false);
  }

  function next() {
    const href = current.href;
    if (href) {
      try {
        router.push(href);
      } catch {
        /* navigation best-effort */
      }
    }
    if (isLast) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <Dialog
      isOpen={open}
      onClose={() => close(true)}
      title={`${current.title} (${step + 1}/${STEPS.length})`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => close(true)}>
            Skip
          </Button>
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={next}>
            {isLast ? "Done" : "Next"}
          </Button>
        </>
      }
    >
      <p className="text-nb-body text-nb-on-surface-variant leading-relaxed">{current.body}</p>
      <ol className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`h-1.5 w-6 rounded-full ${
              i === step ? "bg-nb-primary" : i < step ? "bg-nb-primary/40" : "bg-nb-outline-variant/40"
            }`}
          />
        ))}
      </ol>
    </Dialog>
  );
}
