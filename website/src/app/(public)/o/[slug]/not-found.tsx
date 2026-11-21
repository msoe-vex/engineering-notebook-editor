import Link from "next/link";

export default function PublicOrgNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-nb-surface px-6 text-center text-nb-on-surface">
      <p className="text-nb-label font-semibold uppercase tracking-wide text-nb-on-surface-variant">
        Not found
      </p>
      <h1 className="mt-2 text-nb-display font-bold tracking-tight">Public page unavailable</h1>
      <p className="mt-3 max-w-md text-nb-body text-nb-on-surface-variant">
        This organization isn’t published, the slug is wrong, or the page was taken down.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-nb-lg bg-nb-primary px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          Open ENGen app
        </Link>
      </div>
    </div>
  );
}
