import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-nb-surface px-6 text-center text-nb-on-surface">
      <p className="text-nb-label font-semibold uppercase tracking-wide text-nb-on-surface-variant">
        404
      </p>
      <h1 className="mt-2 text-nb-display font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-md text-nb-body text-nb-on-surface-variant">
        That URL doesn’t match an organization, notebook, or app page. Check the link or head
        back home.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-nb-lg bg-nb-primary px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          Go to app home
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-nb-lg border border-nb-outline-variant/40 px-4 text-sm font-semibold text-nb-on-surface hover:bg-nb-surface-low"
        >
          Browse organizations
        </Link>
      </div>
    </div>
  );
}
