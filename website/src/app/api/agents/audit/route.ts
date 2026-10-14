import { NextResponse } from "next/server";

/**
 * Thin proxy to the Agents service for rubric audits (keeps browser CORS simple).
 * Prefer calling Agents directly from /cloud when NEXT_PUBLIC_AGENTS_API_URL is set.
 */
export async function POST(request: Request) {
  const agentsBase = (process.env.NEXT_PUBLIC_AGENTS_API_URL || "http://localhost:8000").replace(
    /\/$/,
    ""
  );
  let body: {
    orgId?: string;
    notebookId?: string;
    provider?: "byok" | "vertex";
    rubric?: string;
    byokApiKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.orgId || !body.notebookId) {
    return NextResponse.json({ error: "orgId and notebookId are required." }, { status: 400 });
  }

  const auth = request.headers.get("authorization") || "";
  const res = await fetch(
    `${agentsBase}/v1/orgs/${body.orgId}/notebooks/${body.notebookId}/audit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify({
        provider: body.provider ?? "byok",
        rubric: body.rubric,
        byokApiKey: body.byokApiKey,
      }),
    }
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
