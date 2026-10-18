"use client";

import { Skeleton, SkeletonLines } from "@/components/ui";

/** Contributors roster placeholder. */
export function ContributorsPageSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Loading contributors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-nb-xl border border-nb-outline-variant/25 bg-nb-surface px-2 py-2"
          >
            <Skeleton className="h-4 w-4 shrink-0" />
            <Skeleton className="h-10 w-10 shrink-0 rounded-nb-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compile page header + PDF pane placeholder. */
export function CompilePageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-2" aria-busy="true" aria-label="Loading compile">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>
      <Skeleton className="min-h-[50vh] w-full rounded-nb-xl md:min-h-[70vh]" />
    </div>
  );
}

/** Notebook settings form placeholder. */
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-nb-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-3/4" />
      </section>
      <section className="flex flex-col gap-3">
        <Skeleton className="h-6 w-24" />
        <SkeletonLines lines={4} />
      </section>
      <section className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-24 w-full rounded-nb-xl" />
      </section>
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

/** Calendar month grid placeholder. */
export function CalendarPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="Loading calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={`d-${i}`} className="h-3 w-full" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-2">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton key={i} className="min-h-[4.5rem] w-full rounded-nb-xl" />
        ))}
      </div>
    </div>
  );
}
