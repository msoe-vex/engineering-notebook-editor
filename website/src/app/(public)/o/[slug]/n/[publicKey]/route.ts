import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coreBase() {
  return (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
}

/**
 * Share link `/o/:slug/n/:publicKey` proxies the compiled PDF through Core
 * (Core reads storage; visitors never need GCS credentials or signed bucket URLs).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; publicKey: string }> }
) {
  const { slug, publicKey } = await context.params;
  const upstream = `${coreBase()}/public/o/${encodeURIComponent(slug)}/publications/${encodeURIComponent(publicKey)}/pdf`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Accept: "application/pdf" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach Core API to load the shared PDF." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = "Not found";
    try {
      message = (JSON.parse(text) as { error?: string }).error || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    return NextResponse.json({ error: message }, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "application/pdf";
  // If Core somehow returned JSON, surface it instead of serving as a broken PDF.
  if (contentType.includes("application/json")) {
    const data = await res.json();
    return NextResponse.json(data, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  else headers.set("Content-Disposition", 'inline; filename="notebook.pdf"');
  headers.set("Cache-Control", "private, max-age=60");
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(res.body, { status: 200, headers });
}
