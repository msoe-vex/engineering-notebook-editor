"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";

/** Public notebooks are PDF-only; entry routes no longer expose TipTap content. */
export default function PublicEntryGonePage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const publicKey = String(params.publicKey || "");

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Alert variant="error">
        Public notebooks only share the compiled PDF. Individual entries are not available on this
        link.
      </Alert>
      <p className="mt-6 text-center">
        <Link
          href={`/o/${slug}/n/${publicKey}`}
          className="font-semibold text-nb-primary hover:underline"
        >
          Open notebook PDF →
        </Link>
      </p>
    </div>
  );
}
